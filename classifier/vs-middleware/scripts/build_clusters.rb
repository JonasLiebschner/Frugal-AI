# scripts/build_clusters.rb
# frozen_string_literal: true
#
# Offline build script: clusters embeddings, trains per-cluster classifiers,
# stores results in the "clusters" collection.
# Idempotent: drops and recreates clusters collection on each run.

require 'mongo'
require_relative '../config'
require_relative '../lib/clusterer'
require_relative '../lib/classifier'

def run
  client = Mongo::Client.new(MONGODB_URI).use(MONGODB_DATABASE)
  prompts_coll = client[:prompts]
  clusters_coll = client[:clusters]

  # Load all documents
  puts "Loading documents from MongoDB..."
  docs = prompts_coll.find({}, projection: {
    "prompt_text" => 1, "label" => 1, "embedding" => 1, "_id" => 1
  }).to_a
  puts "Loaded #{docs.length} documents."

  if docs.length < 10
    puts "Not enough documents to cluster. Need at least 10."
    return
  end

  # Extract embeddings for clustering
  vectors = docs.map { |d| d["embedding"] }

  # Find optimal k
  puts "\nFinding optimal number of clusters..."
  clusterer = Clusterer.find_optimal_k(vectors, k_range: 3..20)
  puts "Using #{clusterer.k} clusters."

  # Drop and recreate clusters collection
  clusters_coll.drop
  puts "\nCleared clusters collection."

  # Build and store each cluster
  cluster_docs = []
  (0...clusterer.k).each do |cluster_id|
    member_indices = clusterer.assignments.each_with_index
      .select { |a, _| a == cluster_id }
      .map(&:last)

    member_docs = member_indices.map { |i| docs[i] }
    prompts = member_docs.map { |d| { text: d["prompt_text"], label: d["label"] } }

    # Count class distribution
    class_dist = prompts.group_by { |p| p[:label] }.transform_values(&:count)
    class_dist["small_llm"] ||= 0
    class_dist["large_llm"] ||= 0

    # Train classifier
    classifier_data = Classifier.train(prompts)

    # Extract top keywords
    top_kw = Classifier.top_keywords(classifier_data)

    # Generate label from top keywords (first 2-3 distinctive terms)
    all_top = (top_kw["small_llm"].first(2) + top_kw["large_llm"].first(2)).uniq.first(3)
    label = all_top.join("_")

    cluster_doc = {
      cluster_id: cluster_id,
      centroid: clusterer.centroids[cluster_id],
      label: label,
      prompt_count: member_docs.length,
      class_distribution: {
        small_llm: class_dist["small_llm"],
        large_llm: class_dist["large_llm"]
      },
      classifier: classifier_data,
      top_keywords: top_kw
    }

    cluster_docs << cluster_doc
  end

  # Insert all cluster documents
  clusters_coll.insert_many(cluster_docs)
  puts "Inserted #{cluster_docs.length} cluster documents."

  # Assign cluster_id to each prompt document
  puts "\nAssigning cluster_id to prompt documents..."
  docs.each_with_index do |doc, i|
    prompts_coll.update_one(
      { "_id" => doc["_id"] },
      { "$set" => { "cluster_id" => clusterer.assignments[i] } }
    )
  end
  puts "Updated #{docs.length} prompt documents with cluster_id."

  # Print summary
  puts "\n#{'=' * 60}"
  puts "CLUSTER SUMMARY"
  puts "#{'=' * 60}"
  printf "%-4s %-20s %6s %10s %10s   %-30s\n", "ID", "Label", "Size", "small_llm", "large_llm", "Top Keywords (large)"
  puts "-" * 90

  cluster_docs.each do |c|
    printf "%-4d %-20s %6d %10d %10d   %-30s\n",
      c[:cluster_id],
      c[:label][0..19],
      c[:prompt_count],
      c[:class_distribution][:small_llm],
      c[:class_distribution][:large_llm],
      c[:top_keywords]["large_llm"].first(5).join(", ")
  end
  puts "#{'=' * 60}"
  puts "Done!"
end

run
