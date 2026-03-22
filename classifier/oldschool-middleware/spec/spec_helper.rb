# frozen_string_literal: true

ENV['RACK_ENV'] = 'test'

require 'rspec'
require 'json'

RSpec.configure do |config|
  config.formatter = :documentation
end
