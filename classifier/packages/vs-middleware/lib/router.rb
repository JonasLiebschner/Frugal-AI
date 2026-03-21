# lib/router.rb
# frozen_string_literal: true

require 'mongo'
require_relative '../config'
require_relative 'embedder'
require_relative 'classifier'

class Router
  VOTE_WEIGHT = 0.4
  CLASSIFIER_WEIGHT = 0.6
  LOW_CONF_VOTE_WEIGHT = 0.1
  LOW_CONF_CLASSIFIER_WEIGHT = 0.9

  def initialize
    client = Mongo::Client.new(MONGODB_URI).use(MONGODB_DATABASE)
    @collection = client[:prompts]
    @embedder = Embedder.new

    # Load clusters into memory
    clusters_coll = client[:clusters]
    @clusters = {}
    @classifiers = {}
    @centroids = []

    clusters_coll.find.each do |doc|
      cid = doc["cluster_id"]
      @clusters[cid] = doc
      @classifiers[cid] = Classifier.new(doc["classifier"])
      @centroids << { id: cid, centroid: doc["centroid"] }
    end
  end

  # Returns { label:, confidence:, cluster_label: }
  def route(prompt)
    raise "No clusters found. Run scripts/build_clusters.rb first." if @clusters.empty?

    embedding = @embedder.embed(prompt)
    neighbors = vector_search(embedding)
    best_score = neighbors.map { |r| r["score"] }.max || 0

    cluster_id = assign_cluster(neighbors, embedding)
    cluster = @clusters[cluster_id]

    classifier_result = @classifiers[cluster_id].predict(prompt)

    votes = tally_votes(neighbors)
    vote_score = votes[:small_llm].to_f / [votes[:small_llm] + votes[:large_llm], 1].max

    low_confidence = best_score < SIMILARITY_THRESHOLD
    combined = combine_scores(vote_score, classifier_result[:confidence],
                              classifier_result[:label], low_confidence)

    label = combined[:score] >= 0.5 ? "small_llm" : "large_llm"

    { label: label, confidence: combined[:score], cluster_label: cluster["label"] }
  end

  private

  def vector_search(embedding)
    pipeline = [
      {
        "$vectorSearch" => {
          "index" => "vector_index",
          "path" => "embedding",
          "queryVector" => embedding,
          "numCandidates" => VECTOR_SEARCH_CANDIDATES,
          "limit" => VECTOR_SEARCH_LIMIT
        }
      },
      {
        "$project" => {
          "prompt_text" => 1,
          "label" => 1,
          "cluster_id" => 1,
          "score" => { "$meta" => "vectorSearchScore" }
        }
      }
    ]

    @collection.aggregate(pipeline).to_a
  end

  def assign_cluster(neighbors, embedding)
    cluster_counts = Hash.new(0)
    neighbors.each { |n| cluster_counts[n["cluster_id"]] += 1 if n["cluster_id"] }

    majority = cluster_counts.max_by { |_, count| count }
    return majority[0] if majority && majority[1] >= 3

    nearest_centroid(embedding)
  end

  def nearest_centroid(embedding)
    best_id = @centroids.first[:id]
    best_sim = -Float::INFINITY

    @centroids.each do |entry|
      sim = cosine_similarity(embedding, entry[:centroid])
      if sim > best_sim
        best_sim = sim
        best_id = entry[:id]
      end
    end

    best_id
  end

  def cosine_similarity(a, b)
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    a.each_with_index do |val, i|
      dot += val * b[i]
      norm_a += val * val
      norm_b += b[i] * b[i]
    end
    return 0.0 if norm_a == 0 || norm_b == 0
    dot / (Math.sqrt(norm_a) * Math.sqrt(norm_b))
  end

  def combine_scores(vote_score, classifier_confidence, classifier_label, low_confidence)
    classifier_small_score = classifier_label == "small_llm" ? classifier_confidence : 1.0 - classifier_confidence

    if low_confidence
      w_vote = LOW_CONF_VOTE_WEIGHT
      w_class = LOW_CONF_CLASSIFIER_WEIGHT
    else
      w_vote = VOTE_WEIGHT
      w_class = CLASSIFIER_WEIGHT
    end

    score = (w_vote * vote_score + w_class * classifier_small_score).round(4)

    { score: score, weights: { votes: w_vote, classifier: w_class } }
  end

  def tally_votes(results)
    counts = results.group_by { |r| r["label"] }.transform_values(&:count)
    { small_llm: counts.fetch("small_llm", 0), large_llm: counts.fetch("large_llm", 0) }
  end
end
