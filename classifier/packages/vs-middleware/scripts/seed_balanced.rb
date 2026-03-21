# scripts/seed_balanced.rb
# frozen_string_literal: true
#
# Reads a local JSON dataset file, embeds prompts, and inserts into MongoDB.
# Resumable: skips rows already in the collection.
#
# Usage: ruby scripts/seed_balanced.rb [input_file]
#   Default input: data/dataset.json
#   Use --fresh to clear and re-seed from scratch.

require 'json'
require 'mongo'
require_relative '../config'
require_relative '../lib/embedder'

BATCH_SIZE = 50
API_DELAY = 5
INPUT_FILE = (ARGV.reject { |a| a.start_with?('--') }.first) || File.join(__dir__, '..', 'data', 'dataset.json')

def embed_with_retry(embedder, batch)
  retries = 0
  begin
    embedder.embed_batch(batch)
  rescue RuntimeError => e
    if e.message.include?("429") && retries < 5
      retries += 1
      wait = 20 * retries
      puts "  Rate limited, waiting #{wait}s (retry #{retries}/5)..."
      sleep(wait)
      retry
    else
      raise
    end
  end
end

def run
  unless File.exist?(INPUT_FILE)
    puts "Dataset file not found: #{INPUT_FILE}"
    puts "Run download_dataset.rb first."
    return
  end

  all_rows = JSON.parse(File.read(INPUT_FILE))
  puts "Loaded #{all_rows.length} rows from #{INPUT_FILE}"

  client = Mongo::Client.new(MONGODB_URI).use(MONGODB_DATABASE)
  collection = client[:prompts]
  embedder = Embedder.new

  if ARGV.include?('--fresh')
    collection.delete_many({})
    puts "Cleared existing prompts collection."
    start_from = 0
  else
    existing = collection.count_documents({})
    if existing > 0
      puts "Found #{existing} existing documents. Resuming from row #{existing}."
      puts "  (Use --fresh to clear and start over)"
      start_from = existing
    else
      start_from = 0
    end
  end

  remaining = all_rows[start_from..]
  if remaining.nil? || remaining.empty?
    puts "Nothing to seed — all rows already inserted."
    return
  end

  all_rows.shuffle! if start_from == 0

  total_inserted = start_from
  remaining.each_slice(BATCH_SIZE).with_index do |batch, batch_idx|
    prompts = batch.map { |r| r["prompt"] }
    labels = batch.map { |r| r["label"] }
    ids = batch.map { |r| r["id"] }

    puts "  Embedding batch #{batch_idx + 1} (#{prompts.length} prompts)..."
    embeddings = embed_with_retry(embedder, prompts)

    documents = prompts.each_with_index.map do |prompt, i|
      {
        prompt_text: prompt,
        label: labels[i],
        embedding: embeddings[i],
        source_id: ids[i]
      }
    end

    collection.insert_many(documents)
    total_inserted += documents.length
    puts "  Inserted #{total_inserted}/#{all_rows.length} documents."

    sleep(API_DELAY) if API_DELAY > 0
  end

  counts = collection.aggregate([
    { "$group" => { "_id" => "$label", "count" => { "$sum" => 1 } } }
  ]).each_with_object({}) { |r, h| h[r["_id"]] = r["count"] }

  puts "\nDone! #{total_inserted} documents total."
  puts "  small_llm: #{counts["small_llm"] || 0}, large_llm: #{counts["large_llm"] || 0}"
end

run
