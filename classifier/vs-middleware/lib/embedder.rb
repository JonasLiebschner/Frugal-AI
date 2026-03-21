# lib/embedder.rb
# frozen_string_literal: true

require 'net/http'
require 'json'
require 'uri'
require_relative '../config'

class Embedder
  MONGODB_EMBEDDINGS_URL = URI("https://ai.mongodb.com/v1/embeddings")
  BATCH_SIZE = 100

  def embed(text)
    embed_batch([text]).first
  end

  def embed_batch(texts)
    results = []
    texts.each_slice(BATCH_SIZE) do |batch|
      response = call_api(batch)
      results.concat(response["data"].map { |d| d["embedding"] })
    end
    results
  end

  private

  def call_api(input)
    request = Net::HTTP::Post.new(MONGODB_EMBEDDINGS_URL)
    request["Authorization"] = "Bearer #{MONGODB_API_KEY}"
    request["Content-Type"] = "application/json"
    request.body = { model: EMBEDDING_MODEL, input: input }.to_json

    response = Net::HTTP.start(MONGODB_EMBEDDINGS_URL.hostname, MONGODB_EMBEDDINGS_URL.port, use_ssl: true) do |http|
      http.request(request)
    end

    raise "MongoDB Embedding API error: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end
end
