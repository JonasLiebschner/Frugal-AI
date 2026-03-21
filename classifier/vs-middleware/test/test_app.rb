# test/test_app.rb
# frozen_string_literal: true

ENV['APP_ENV'] = 'test'

require_relative 'test_helper'
require 'rack/test'
require_relative '../app'

class TestApp < Minitest::Test
  include Rack::Test::Methods

  def app
    Sinatra::Application
  end

  def test_classify_returns_400_when_query_missing
    post '/api/v1/classify', {}.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_equal 400, last_response.status
    body = JSON.parse(last_response.body)
    assert body.key?("error")
  end

  def test_classify_returns_400_for_empty_query
    post '/api/v1/classify', { query: "" }.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_equal 400, last_response.status
    body = JSON.parse(last_response.body)
    assert body.key?("error")
  end

  def test_classify_returns_400_for_invalid_json
    post '/api/v1/classify', 'not json', { 'CONTENT_TYPE' => 'application/json' }
    assert_equal 400, last_response.status
    body = JSON.parse(last_response.body)
    assert body.key?("error")
  end

  def test_classify_returns_400_when_query_is_not_string
    post '/api/v1/classify', { query: 123 }.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_equal 400, last_response.status
  end
end
