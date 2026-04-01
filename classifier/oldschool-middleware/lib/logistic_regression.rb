# frozen_string_literal: true

require 'json'

class LogisticRegression
  attr_reader :weights, :bias, :means, :stds

  def initialize(feature_count:, feature_names: nil, learning_rate: 0.01, lambda_reg: 0.01, max_epochs: 1000, patience: 50)
    @feature_count = feature_count
    @feature_names = feature_names
    @learning_rate = learning_rate
    @lambda_reg = lambda_reg
    @max_epochs = max_epochs
    @patience = patience
    @weights = Array.new(feature_count, 0.0)
    @bias = 0.0
    @means = nil
    @stds = nil
    @train_accuracy = nil
    @val_accuracy = nil
  end

  def train(features, labels, val_split: 0.1)
    train_features, train_labels, val_features, val_labels = stratified_split(features, labels, val_split)
    @means, @stds = compute_normalization(train_features)
    train_norm = train_features.map { |f| normalize(f) }
    val_norm = val_features.map { |f| normalize(f) }

    best_val_loss = Float::INFINITY
    epochs_without_improvement = 0
    n = train_norm.length.to_f

    @max_epochs.times do |epoch|
      lr = @learning_rate / (1.0 + epoch * 0.001)
      predictions = train_norm.map { |f| sigmoid(dot(f)) }

      grad_w = Array.new(@feature_count, 0.0)
      grad_b = 0.0

      train_norm.each_with_index do |f, i|
        error = predictions[i] - train_labels[i]
        f.each_with_index { |fv, j| grad_w[j] += error * fv }
        grad_b += error
      end

      @feature_count.times do |j|
        @weights[j] -= lr * (grad_w[j] / n + @lambda_reg * @weights[j])
      end
      @bias -= lr * (grad_b / n)

      val_loss = cross_entropy_loss(val_norm, val_labels)
      if val_loss < best_val_loss
        best_val_loss = val_loss
        epochs_without_improvement = 0
      else
        epochs_without_improvement += 1
        break if epochs_without_improvement >= @patience
      end
    end

    @train_accuracy = accuracy(train_norm, train_labels)
    @val_accuracy = accuracy(val_norm, val_labels)

    self
  end

  def predict(features)
    norm = normalize(features)
    prob = sigmoid(dot(norm))
    label = prob >= 0.5 ? 1 : 0
    confidence = (prob - 0.5).abs * 2

    { label: label, probability: prob, confidence: confidence }
  end

  def top_contributing_features(features, feature_names, count: 3)
    norm = normalize(features)
    contributions = norm.each_with_index.map { |fv, i| [feature_names[i], (fv * @weights[i]).abs, features[i]] }
    contributions.sort_by { |_, c, _| -c }.first(count).map { |name, _, raw| [name, raw] }.to_h
  end

  def save(path)
    train_acc = @train_accuracy&.nan? ? nil : @train_accuracy
    val_acc = @val_accuracy&.nan? ? nil : @val_accuracy
    data = {
      weights: @weights,
      bias: @bias,
      feature_count: @feature_count,
      feature_names: @feature_names,
      normalization: { means: @means, stds: @stds },
      metadata: {
        trained_at: Time.now.strftime('%Y-%m-%d'),
        train_accuracy: train_acc,
        val_accuracy: val_acc
      }
    }
    File.write(path, JSON.pretty_generate(data))
  end

  def self.load(path)
    data = JSON.parse(File.read(path))
    model = new(feature_count: data['feature_count'], feature_names: data['feature_names'])
    model.instance_variable_set(:@weights, data['weights'])
    model.instance_variable_set(:@bias, data['bias'])
    model.instance_variable_set(:@means, data.dig('normalization', 'means'))
    model.instance_variable_set(:@stds, data.dig('normalization', 'stds'))
    model
  end

  private

  def sigmoid(z)
    if z >= 0
      1.0 / (1.0 + Math.exp(-z))
    else
      ez = Math.exp(z)
      ez / (1.0 + ez)
    end
  end

  def dot(features)
    sum = @bias
    features.each_with_index { |f, i| sum += f * @weights[i] }
    sum
  end

  def normalize(features)
    return features if @means.nil?

    features.each_with_index.map do |f, i|
      std = @stds[i].zero? ? 1.0 : @stds[i]
      (f - @means[i]) / std
    end
  end

  def compute_normalization(features)
    n = features.length.to_f
    dim = features.first.length

    means = Array.new(dim, 0.0)
    features.each { |f| f.each_with_index { |v, i| means[i] += v } }
    means.map! { |m| m / n }

    stds = Array.new(dim, 0.0)
    features.each { |f| f.each_with_index { |v, i| stds[i] += (v - means[i])**2 } }
    stds.map! { |s| Math.sqrt(s / n) }

    [means, stds]
  end

  def accuracy(features, labels)
    correct = features.each_with_index.count { |f, i| (sigmoid(dot(f)) >= 0.5 ? 1 : 0) == labels[i] }
    correct.to_f / labels.length
  end

  def cross_entropy_loss(features, labels)
    eps = 1e-15
    total = 0.0
    features.each_with_index do |f, i|
      p = sigmoid(dot(f))
      p = [[p, eps].max, 1.0 - eps].min
      total += -(labels[i] * Math.log(p) + (1 - labels[i]) * Math.log(1 - p))
    end
    total / features.length
  end

  def stratified_split(features, labels, val_ratio)
    groups = labels.each_with_index.group_by { |l, _| l }.transform_values { |v| v.map(&:last).shuffle }

    train_idx = []
    val_idx = []

    groups.each_value do |indices|
      split = (indices.length * (1 - val_ratio)).round
      train_idx.concat(indices.first(split))
      val_idx.concat(indices[split..])
    end

    train_idx.shuffle!
    val_idx.shuffle!

    [
      train_idx.map { |i| features[i] },
      train_idx.map { |i| labels[i] },
      val_idx.map { |i| features[i] },
      val_idx.map { |i| labels[i] }
    ]
  end
end
