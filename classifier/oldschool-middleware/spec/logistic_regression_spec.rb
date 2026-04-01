# frozen_string_literal: true

require_relative 'spec_helper'
require_relative '../lib/logistic_regression'

RSpec.describe LogisticRegression do
  describe '#train and #predict' do
    it 'learns a simple linearly separable pattern' do
      features = [
        [1.0, 1.0], [2.0, 1.0], [1.0, 2.0], [3.0, 0.5],
        [-1.0, -1.0], [-2.0, -1.0], [-1.0, -2.0], [-3.0, -0.5]
      ]
      labels = [1, 1, 1, 1, 0, 0, 0, 0]

      model = LogisticRegression.new(feature_count: 2)
      model.train(features, labels)

      expect(model.predict([5.0, 5.0])[:label]).to eq(1)
      expect(model.predict([-5.0, -5.0])[:label]).to eq(0)
    end

    it 'returns probability between 0 and 1' do
      model = LogisticRegression.new(feature_count: 1)
      model.train([[1.0], [2.0], [-1.0], [-2.0]], [1, 1, 0, 0])

      result = model.predict([0.0])
      expect(result[:probability]).to be_between(0.0, 1.0)
    end

    it 'returns confidence between 0 and 1' do
      model = LogisticRegression.new(feature_count: 1)
      model.train([[1.0], [2.0], [-1.0], [-2.0]], [1, 1, 0, 0])

      result = model.predict([10.0])
      expect(result[:confidence]).to be_between(0.0, 1.0)
    end
  end

  describe '#save and .load' do
    it 'round-trips through JSON' do
      model = LogisticRegression.new(feature_count: 2)
      model.train(
        [[1.0, 1.0], [2.0, 1.0], [-1.0, -1.0], [-2.0, -1.0]],
        [1, 1, 0, 0]
      )

      path = '/tmp/test_model.json'
      model.save(path)

      loaded = LogisticRegression.load(path)
      original_result = model.predict([1.0, 1.0])
      loaded_result = loaded.predict([1.0, 1.0])

      expect(loaded_result[:probability]).to be_within(0.001).of(original_result[:probability])
    ensure
      File.delete(path) if File.exist?(path)
    end
  end

  describe 'normalization' do
    it 'handles features with different scales' do
      features = [
        [1000, 0.9], [900, 0.8], [800, 0.7],
        [100, 0.1], [200, 0.2], [50, 0.15]
      ]
      labels = [1, 1, 1, 0, 0, 0]

      model = LogisticRegression.new(feature_count: 2)
      model.train(features, labels)

      expect(model.predict([950, 0.85])[:label]).to eq(1)
      expect(model.predict([80, 0.1])[:label]).to eq(0)
    end
  end
end
