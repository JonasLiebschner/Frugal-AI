# lib/classifier.rb
# frozen_string_literal: true

class Classifier
  LAPLACE_ALPHA = 1

  # classifier_data: hash from cluster document's "classifier" field
  # Expected keys: "vocab", "idf", "log_priors", "log_likelihoods"
  def initialize(classifier_data)
    @vocab = classifier_data["vocab"]           # { "term" => index }
    @idf = classifier_data["idf"]               # [Float]
    @log_priors = classifier_data["log_priors"]  # { "small_llm" => Float, "large_llm" => Float }
    @log_likelihoods = classifier_data["log_likelihoods"] # { "small_llm" => [Float], "large_llm" => [Float] }
    @vocab_size = @vocab.size
  end

  # Returns { label:, confidence:, top_terms: }
  def predict(text)
    tokens = self.class.tokenize(text)
    tfidf = compute_tfidf(tokens)

    # Compute log-posteriors for each class
    log_posteriors = {}
    %w[small_llm large_llm].each do |label|
      log_p = @log_priors[label]
      tfidf.each do |term_idx, weight|
        log_p += weight * @log_likelihoods[label][term_idx]
      end
      log_posteriors[label] = log_p
    end

    # Convert to confidence via log-sum-exp (numerical stability)
    max_log = log_posteriors.values.max
    exp_small = Math.exp(log_posteriors["small_llm"] - max_log)
    exp_large = Math.exp(log_posteriors["large_llm"] - max_log)
    confidence_small = exp_small / (exp_small + exp_large)

    label = confidence_small >= 0.5 ? "small_llm" : "large_llm"
    confidence = label == "small_llm" ? confidence_small : 1.0 - confidence_small

    # Find top influencing terms
    top_terms = extract_top_terms(tokens, tfidf, label, limit: 5)

    { label: label, confidence: confidence.round(4), top_terms: top_terms }
  end

  # Tokenize: lowercase, strip punctuation, split on whitespace
  def self.tokenize(text)
    text.downcase.gsub(/[^a-z0-9\s]/, '').split
  end

  # Train a classifier from a set of documents
  # docs: [{ text:, label: }]
  # Returns a hash suitable for storing in MongoDB and initializing a Classifier
  def self.train(docs, vocab_cap: 2000)
    # Build vocabulary from all docs
    doc_freq = Hash.new(0)
    docs.each do |doc|
      tokens = tokenize(doc[:text]).uniq
      tokens.each { |t| doc_freq[t] += 1 }
    end

    # Cap vocabulary at top terms by document frequency
    top_terms = doc_freq.sort_by { |_, freq| -freq }.first(vocab_cap).map(&:first)
    vocab = {}
    top_terms.each_with_index { |term, i| vocab[term] = i }

    n_docs = docs.length.to_f
    idf = top_terms.map { |term| Math.log(n_docs / (doc_freq[term] + 1)) }

    # Compute per-class term counts
    class_docs = docs.group_by { |d| d[:label] }
    log_priors = {}
    log_likelihoods = {}

    %w[small_llm large_llm].each do |label|
      class_d = class_docs.fetch(label, [])
      log_priors[label] = Math.log((class_d.length + LAPLACE_ALPHA) / (n_docs + 2 * LAPLACE_ALPHA))

      # Count term occurrences in this class
      term_counts = Array.new(vocab.size, 0)
      total_terms = 0
      class_d.each do |doc|
        tokens = tokenize(doc[:text])
        tokens.each do |t|
          idx = vocab[t]
          if idx
            term_counts[idx] += 1
            total_terms += 1
          end
        end
      end

      # Log-likelihoods with Laplace smoothing
      log_likelihoods[label] = term_counts.map do |count|
        Math.log((count + LAPLACE_ALPHA).to_f / (total_terms + LAPLACE_ALPHA * vocab.size))
      end
    end

    {
      "vocab" => vocab,
      "idf" => idf,
      "log_priors" => log_priors,
      "log_likelihoods" => log_likelihoods
    }
  end

  # Extract top discriminating keywords for each class
  def self.top_keywords(classifier_data, limit: 10)
    vocab_inv = classifier_data["vocab"].invert  # index => term
    result = {}

    %w[small_llm large_llm].each do |label|
      other = label == "small_llm" ? "large_llm" : "small_llm"
      # Score each term by how much more likely it is in this class vs the other
      scores = classifier_data["log_likelihoods"][label].each_with_index.map do |ll, i|
        other_ll = classifier_data["log_likelihoods"][other][i]
        [vocab_inv[i], ll - other_ll]
      end
      result[label] = scores.sort_by { |_, s| -s }.first(limit).map(&:first)
    end

    result
  end

  private

  def compute_tfidf(tokens)
    # Term frequency in query
    tf = Hash.new(0)
    tokens.each do |t|
      idx = @vocab[t]
      tf[idx] += 1 if idx  # ignore out-of-vocabulary
    end

    # TF-IDF weights
    tfidf = {}
    tf.each do |idx, count|
      tfidf[idx] = count * @idf[idx]
    end
    tfidf
  end

  def extract_top_terms(tokens, tfidf, winning_label, limit: 5)
    vocab_inv = @vocab.invert
    # Score each query token by its TF-IDF weight * how much it favors the winning label
    other = winning_label == "small_llm" ? "large_llm" : "small_llm"

    scored = tfidf.map do |idx, weight|
      ll_diff = @log_likelihoods[winning_label][idx] - @log_likelihoods[other][idx]
      [vocab_inv[idx], weight * ll_diff]
    end

    scored.select { |_, s| s > 0 }.sort_by { |_, s| -s }.first(limit).map(&:first)
  end
end
