#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'parallel'
require_relative '../lib/feature_extractor'
require_relative '../lib/logistic_regression'

DATA_PATH = File.join(__dir__, '..', 'data', 'llm_router_dataset-synth', 'train.jsonl')
MODEL_PATH = File.join(__dir__, '..', 'models', 'model.json')

puts "Loading training data from #{DATA_PATH}..."
lines = File.readlines(DATA_PATH)
puts "Loaded #{lines.length} examples."

puts "Extracting features using #{Parallel.processor_count} CPU cores..."
records = lines.map { |line| JSON.parse(line) }

features_and_labels = Parallel.map(records, progress: "Extracting features") do |record|
  extractor = FeatureExtractor.new(record['prompt'])
  [extractor.feature_vector, record['label']]
end

features = features_and_labels.map(&:first)
labels = features_and_labels.map(&:last)

feature_count = features.first.length
puts "Feature count: #{feature_count}"
puts "Label distribution: 0 (small)=#{labels.count(0)}, 1 (large)=#{labels.count(1)}"

puts "\nTraining logistic regression..."
model = LogisticRegression.new(
  feature_count: feature_count,
  feature_names: FeatureExtractor::FEATURE_ORDER.map(&:to_s),
  learning_rate: 0.01,
  lambda_reg: 0.01,
  max_epochs: 1000,
  patience: 50
)
model.train(features, labels)

model.save(MODEL_PATH)
puts "\nModel saved to #{MODEL_PATH}"

# Quick accuracy check on training data
correct = 0
features.each_with_index do |f, i|
  pred = model.predict(f)[:label]
  correct += 1 if pred == labels[i]
end
puts "Training accuracy: #{(correct.to_f / labels.length * 100).round(2)}%"
