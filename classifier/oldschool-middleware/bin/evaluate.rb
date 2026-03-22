#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'parallel'
require_relative '../lib/feature_extractor'
require_relative '../lib/logistic_regression'

DATA_PATH = File.join(__dir__, '..', 'data', 'llm_router_dataset-synth', 'test.jsonl')
MODEL_PATH = File.join(__dir__, '..', 'models', 'model.json')

puts "Loading model from #{MODEL_PATH}..."
model = LogisticRegression.load(MODEL_PATH)

puts "Loading test data from #{DATA_PATH}..."
lines = File.readlines(DATA_PATH)
records = lines.map { |line| JSON.parse(line) }
puts "Loaded #{records.length} test examples."

puts "Extracting features using #{Parallel.processor_count} CPU cores..."
data = Parallel.map(records, progress: "Evaluating") do |record|
  extractor = FeatureExtractor.new(record['prompt'])
  prediction = model.predict(extractor.feature_vector)
  { predicted: prediction[:label], actual: record['label'] }
end

# Confusion matrix
tp = data.count { |d| d[:predicted] == 1 && d[:actual] == 1 }
tn = data.count { |d| d[:predicted] == 0 && d[:actual] == 0 }
fp = data.count { |d| d[:predicted] == 1 && d[:actual] == 0 }
fn = data.count { |d| d[:predicted] == 0 && d[:actual] == 1 }

accuracy = (tp + tn).to_f / data.length
precision = tp.zero? ? 0 : tp.to_f / (tp + fp)
recall = tp.zero? ? 0 : tp.to_f / (tp + fn)
f1 = (precision + recall).zero? ? 0 : 2 * precision * recall / (precision + recall)

puts "\n=== Evaluation Results ==="
puts "Accuracy:  #{(accuracy * 100).round(2)}%"
puts "Precision: #{(precision * 100).round(2)}%"
puts "Recall:    #{(recall * 100).round(2)}%"
puts "F1 Score:  #{(f1 * 100).round(2)}%"
puts "\nConfusion Matrix:"
puts "              Predicted"
puts "              Small  Large"
puts "Actual Small  #{tn.to_s.rjust(5)}  #{fp.to_s.rjust(5)}"
puts "Actual Large  #{fn.to_s.rjust(5)}  #{tp.to_s.rjust(5)}"
puts "\nTotal: #{data.length} examples"
