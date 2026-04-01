# frozen_string_literal: true

require_relative 'feature_extractor'
require_relative 'logistic_regression'

class Classifier
  LABELS = { 0 => 'small', 1 => 'large' }.freeze

  def initialize(model_path)
    @model = LogisticRegression.load(model_path)
  end

  def classify(query)
    extractor = FeatureExtractor.new(query)
    features = extractor.feature_vector
    result = @model.predict(features)
    top = @model.top_contributing_features(features, FeatureExtractor::FEATURE_ORDER.map(&:to_s), count: 3)

    {
      result: LABELS[result[:label]],
      additionalData: {
        confidence: result[:confidence].round(4),
        probability: result[:probability].round(4),
        top_features: top
      }
    }
  end
end
