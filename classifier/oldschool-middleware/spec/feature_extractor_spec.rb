# frozen_string_literal: true

require_relative 'spec_helper'
require_relative '../lib/feature_extractor'

RSpec.describe FeatureExtractor do
  describe '#extract' do
    it 'returns a hash with all expected feature keys' do
      features = FeatureExtractor.new("What is 2+2?").extract
      expect(features).to be_a(Hash)
      expect(features.keys).to include(
        :char_count, :word_count, :sentence_count,
        :avg_sentence_length, :avg_word_length,
        :type_token_ratio, :long_word_ratio,
        :rare_word_count, :syllable_count
      )
    end

    context 'length signals' do
      let(:features) { FeatureExtractor.new("The quick brown fox jumps. Over the lazy dog.").extract }

      it 'counts characters' do
        expect(features[:char_count]).to eq(45)
      end

      it 'counts words' do
        expect(features[:word_count]).to eq(9)
      end

      it 'counts sentences' do
        expect(features[:sentence_count]).to eq(2)
      end

      it 'computes average sentence length' do
        expect(features[:avg_sentence_length]).to be_within(0.1).of(4.5)
      end

      it 'computes average word length' do
        expect(features[:avg_word_length]).to be > 0
      end
    end

    context 'vocabulary complexity' do
      let(:features) { FeatureExtractor.new("The implications of quantum entanglement on cryptography are significant and far-reaching.").extract }

      it 'computes type-token ratio' do
        expect(features[:type_token_ratio]).to be_between(0.0, 1.0)
      end

      it 'counts long words (> 6 chars)' do
        expect(features[:long_word_ratio]).to be > 0
      end

      it 'counts rare words (> 8 chars)' do
        expect(features[:rare_word_count]).to be >= 3
      end

      it 'estimates syllable count' do
        expect(features[:syllable_count]).to be > 0
      end
    end

    context 'readability signals' do
      it 'computes Flesch-Kincaid grade level' do
        features = FeatureExtractor.new("The implications of quantum entanglement on modern cryptography are far-reaching and significant for national security.").extract
        expect(features[:flesch_kincaid_grade]).to be > 5
      end

      it 'computes ARI' do
        features = FeatureExtractor.new("Hi.").extract
        expect(features[:ari]).to be_a(Numeric)
      end
    end

    context 'structure signals' do
      let(:features) { FeatureExtractor.new("What are the differences between X and Y, and how do they compare?").extract }

      it 'counts question marks' do
        expect(features[:question_mark_count]).to eq(1)
      end

      it 'counts commas' do
        expect(features[:comma_count]).to eq(1)
      end

      it 'counts conjunctions' do
        expect(features[:conjunction_count]).to be >= 2
      end
    end

    context 'keyword signals' do
      it 'detects complexity keywords' do
        features = FeatureExtractor.new("Analyze and compare the differences between CNN and RNN architectures.").extract
        expect(features[:complexity_keyword_count]).to be >= 3
      end

      it 'detects simplicity keywords' do
        features = FeatureExtractor.new("What is the capital of France?").extract
        expect(features[:simplicity_keyword_count]).to be >= 1
      end

      it 'detects code keywords' do
        features = FeatureExtractor.new("Write a function to sort an array using an algorithm.").extract
        expect(features[:code_keyword_count]).to be >= 2
      end

      it 'detects jargon' do
        features = FeatureExtractor.new("The implementation of optimization and regularization methods.").extract
        expect(features[:jargon_density]).to be >= 3
      end
    end

    context 'meta signals' do
      it 'detects question starters' do
        features = FeatureExtractor.new("How does photosynthesis work?").extract
        expect(features[:starts_with_question_word]).to eq(1)
      end

      it 'detects non-question starters' do
        features = FeatureExtractor.new("Explain photosynthesis.").extract
        expect(features[:starts_with_question_word]).to eq(0)
      end

      it 'detects ending question mark' do
        features = FeatureExtractor.new("What is life?").extract
        expect(features[:ends_with_question]).to eq(1)
      end
    end

    context 'edge cases' do
      it 'handles empty string without error' do
        features = FeatureExtractor.new("").extract
        expect(features[:word_count]).to eq(0)
        expect(features[:avg_sentence_length]).to eq(0)
        expect(features[:avg_word_length]).to eq(0)
      end

      it 'handles single word' do
        features = FeatureExtractor.new("Hello").extract
        expect(features[:word_count]).to eq(1)
        expect(features[:type_token_ratio]).to eq(1.0)
      end
    end
  end

  describe '#feature_vector' do
    it 'returns an array of floats in fixed order' do
      vec = FeatureExtractor.new("Hello world.").feature_vector
      expect(vec).to be_an(Array)
      expect(vec.length).to eq(FeatureExtractor::FEATURE_ORDER.length)
      expect(vec).to all(be_a(Numeric))
    end
  end
end
