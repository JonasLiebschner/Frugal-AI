# frozen_string_literal: true

require 'sinatra'
require 'sinatra/json'
require_relative 'lib/classifier'

MODEL_PATH = File.join(__dir__, 'models', 'model.json')

set :port, ENV.fetch('PORT', 3005).to_i
set :bind, '0.0.0.0'
set :protection, false

# Lazy-load classifier on first request
def classifier
  @classifier ||= Classifier.new(MODEL_PATH)
end

post '/api/v1/classify' do
  content_type :json

  begin
    body = JSON.parse(request.body.read)
  rescue JSON::ParserError
    halt 400, json(error: 'Invalid JSON')
  end

  query = body['query']

  unless query.is_a?(String) && !query.strip.empty?
    halt 400, json(error: 'Missing or empty query field')
  end

  begin
    result = classifier.classify(query)
    json result
  rescue => e
    halt 500, json(error: e.message)
  end
end
