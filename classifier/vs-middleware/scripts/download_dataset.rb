# scripts/download_dataset.rb
# frozen_string_literal: true
#
# Downloads a balanced dataset from HuggingFace and saves to a local JSON file.
# Resumable: appends to existing file if it exists.
#
# Usage: ruby scripts/download_dataset.rb [output_file]
#   Default output: data/dataset.json

require 'net/http'
require 'json'
require 'uri'
require 'fileutils'

LABEL_MAP = { 0 => "small_llm", 1 => "large_llm" }.freeze
TARGET_PER_LABEL = 2000
OUTPUT_FILE = ARGV[0] || File.join(__dir__, '..', 'data', 'dataset.json')

def fetch_page(offset, length)
  retries = 0
  begin
    url = URI("https://datasets-server.huggingface.co/rows?dataset=DevQuasar%2Fllm_router_dataset-synth&config=default&split=train&offset=#{offset}&length=#{length}")
    response = Net::HTTP.get_response(url)
    raise "HuggingFace API error: #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  rescue RuntimeError => e
    if e.message.include?("429") && retries < 10
      retries += 1
      wait = retries * 10
      puts "  Rate limited, waiting #{wait}s (retry #{retries}/10)..."
      sleep(wait)
      retry
    else
      raise
    end
  end
end

def run
  # Resume from existing file
  existing = []
  if File.exist?(OUTPUT_FILE)
    existing = JSON.parse(File.read(OUTPUT_FILE))
    puts "Found existing file with #{existing.length} rows."
  end

  counts = { "small_llm" => 0, "large_llm" => 0 }
  existing.each { |r| counts[r["label"]] += 1 }

  all_rows = existing.dup

  if counts["large_llm"] < TARGET_PER_LABEL
    # Estimate offset based on what we already have
    offset = (counts["large_llm"] * 2.5).to_i  # rough ratio of large_llm in early pages
    while counts["large_llm"] < TARGET_PER_LABEL
      puts "Fetching large_llm rows from offset #{offset}... (have #{counts["large_llm"]}/#{TARGET_PER_LABEL})"
      data = fetch_page(offset, 100)
      rows = data["rows"]
      break if rows.nil? || rows.empty?

      rows.each do |r|
        label = LABEL_MAP[r.dig("row", "label")]
        if label == "large_llm" && counts["large_llm"] < TARGET_PER_LABEL
          all_rows << { "prompt" => r.dig("row", "prompt"), "label" => label, "id" => r.dig("row", "id") }
          counts["large_llm"] += 1
        end
      end
      offset += 100
      save(all_rows)
      sleep(3)
    end
  end
  puts "  large_llm: #{counts["large_llm"]}"

  if counts["small_llm"] < TARGET_PER_LABEL
    offset = 2000 + (counts["small_llm"] * 2.5).to_i
    while counts["small_llm"] < TARGET_PER_LABEL
      puts "Fetching small_llm rows from offset #{offset}... (have #{counts["small_llm"]}/#{TARGET_PER_LABEL})"
      data = fetch_page(offset, 100)
      rows = data["rows"]
      break if rows.nil? || rows.empty?

      rows.each do |r|
        label = LABEL_MAP[r.dig("row", "label")]
        if label == "small_llm" && counts["small_llm"] < TARGET_PER_LABEL
          all_rows << { "prompt" => r.dig("row", "prompt"), "label" => label, "id" => r.dig("row", "id") }
          counts["small_llm"] += 1
        end
      end
      offset += 100
      save(all_rows)
      sleep(3)
    end
  end
  puts "  small_llm: #{counts["small_llm"]}"

  save(all_rows)
  puts "\nDone! #{all_rows.length} rows saved to #{OUTPUT_FILE}"
  puts "  small_llm: #{counts["small_llm"]}, large_llm: #{counts["large_llm"]}"
end

def save(rows)
  FileUtils.mkdir_p(File.dirname(OUTPUT_FILE))
  File.write(OUTPUT_FILE, JSON.pretty_generate(rows))
end

run
