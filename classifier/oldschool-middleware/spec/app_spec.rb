# frozen_string_literal: true

require_relative 'spec_helper'
require 'rack/test'
require_relative '../app'

RSpec.describe 'Oldschool Classifier API' do
  include Rack::Test::Methods

  def app
    Sinatra::Application
  end

  describe 'POST /api/v1/classify' do
    it 'returns 400 for missing query' do
      post '/api/v1/classify', '{}', 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(400)
    end

    it 'returns 400 for empty query' do
      post '/api/v1/classify', '{"query": ""}', 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(400)
    end

    it 'returns 400 for invalid JSON' do
      post '/api/v1/classify', 'not json', 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(400)
    end

    it 'returns 400 for non-string query' do
      post '/api/v1/classify', '{"query": 123}', 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(400)
    end

    it 'classifies a simple prompt' do
      post '/api/v1/classify', '{"query": "What is 2+2?"}', 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(200)
      body = JSON.parse(last_response.body)
      expect(body['result']).to be_a(String).and satisfy { |v| %w[small large].include?(v) }
      expect(body['additionalData']).to be_a(Hash)
      expect(body['additionalData']['confidence']).to be_a(Numeric)
    end
  end

  describe 'end-to-end classification quality' do
    it 'classifies a simple factual question as small' do
      post '/api/v1/classify', '{"query": "What is the capital of France?"}', 'CONTENT_TYPE' => 'application/json'
      body = JSON.parse(last_response.body)
      expect(body['result']).to eq('small')
    end

    it 'classifies a complex analytical question as large' do
      post '/api/v1/classify', '{"query": "Analyze the implications of quantum entanglement on modern cryptography and discuss how it differs from classical encryption methods in terms of security guarantees and computational complexity."}', 'CONTENT_TYPE' => 'application/json'
      body = JSON.parse(last_response.body)
      expect(body['result']).to eq('large')
    end

    it 'includes top_features in response' do
      post '/api/v1/classify', '{"query": "Hello"}', 'CONTENT_TYPE' => 'application/json'
      body = JSON.parse(last_response.body)
      expect(body['additionalData']['top_features']).to be_a(Hash)
      expect(body['additionalData']['top_features'].keys.length).to eq(3)
    end
  end
end
