# app.rb
# frozen_string_literal: true

require 'sinatra'
require 'sinatra/json'
require 'sinatra/reloader'
require 'json'
require_relative 'config'
require_relative 'lib/router'

set :port, 3003
set :protection, false

configure :development do
  register Sinatra::Reloader
  also_reload File.join(__dir__, 'lib/**/*.rb')
  also_reload File.join(__dir__, 'config.rb')
end

# Lazy router: initialized on first request, not at load time.
def router
  @router ||= Router.new
end

post '/api/v1/classify' do
  content_type :json

  begin
    body = JSON.parse(request.body.read)
  rescue JSON::ParserError
    halt 400, { error: "Invalid JSON in request body" }.to_json
  end

  query = body["query"]

  if query.nil? || !query.is_a?(String) || query.strip.empty?
    halt 400, { error: "Missing required field: query" }.to_json
  end

  begin
    result = router.route(query)
    api_label = result[:label] == "small_llm" ? "small" : "large"
    confidence = result[:label] == "small_llm" ? result[:confidence] : (1.0 - result[:confidence]).round(4)

    json({
      result: api_label,
      additionalData: {
        confidence: confidence
      }
    })
  rescue => e
    halt 500, { error: e.message }.to_json
  end
end
