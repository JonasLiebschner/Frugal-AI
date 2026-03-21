# lib/clusterer.rb
# frozen_string_literal: true

require 'etc'

class Clusterer
  MAX_ITERATIONS = 50

  attr_reader :centroids, :assignments, :k

  # vectors: array of arrays (each inner array is a 1024-dim embedding)
  # k: number of clusters
  def initialize(vectors, k)
    @vectors = vectors
    @k = k
    @dim = vectors.first.length
    @centroids = []
    @assignments = []
  end

  def fit
    # Initialize centroids via k-means++ style: pick random spread
    indices = @vectors.each_index.to_a.shuffle.first(@k)
    @centroids = indices.map { |i| @vectors[i].dup }

    MAX_ITERATIONS.times do |iter|
      # Assign each vector to nearest centroid
      new_assignments = @vectors.map { |v| nearest_centroid(v) }

      # Check convergence
      break if new_assignments == @assignments

      @assignments = new_assignments

      # Recompute centroids
      @centroids = (0...@k).map do |c|
        members = @vectors.each_with_index.select { |_, i| @assignments[i] == c }.map(&:first)
        if members.empty?
          # Keep old centroid for empty clusters
          @centroids[c]
        else
          mean_vector(members)
        end
      end

      puts "  K-means iteration #{iter + 1}: assignments updated" if (iter + 1) % 10 == 0
    end

    # Remove empty clusters
    remove_empty_clusters

    self
  end

  def predict(vector)
    nearest_centroid(vector)
  end

  # Silhouette score on a sample of vectors
  # Returns average silhouette coefficient (-1 to 1, higher is better)
  def silhouette_score(sample_size: 500)
    return 0.0 if @k <= 1

    sample_indices = @vectors.each_index.to_a.shuffle.first(sample_size)
    scores = sample_indices.map { |i| silhouette_for_point(i) }
    scores.sum / scores.length.to_f
  end

  # Find optimal k by testing range and picking best silhouette.
  # Forks a child process per k value for true parallelism.
  # Results are written to disk (tmp files) so work survives crashes,
  # and previously completed k values are skipped on re-run.
  def self.find_optimal_k(vectors, k_range: 3..20, work_dir: nil)
    require 'fileutils'
    require 'tmpdir'

    candidates = k_range.to_a.select { |k| k < vectors.length }
    work_dir ||= File.join(Dir.tmpdir, "clusterer_#{vectors.length}")
    FileUtils.mkdir_p(work_dir)

    # Check for previously completed results
    done = {}
    candidates.each do |k|
      result_file = File.join(work_dir, "k_#{k}.marshal")
      if File.exist?(result_file)
        data = Marshal.load(File.read(result_file))
        done[k] = data
        puts "  k=#{k}: cached silhouette=#{data[:score].round(4)}"
      end
    end

    remaining = candidates - done.keys
    if remaining.empty?
      puts "All k values cached in #{work_dir}"
    else
      puts "Testing k=#{remaining.join(',')} across #{[remaining.length, Etc.nprocessors].min} cores..."
      puts "Results cached in #{work_dir}"

      # Fork all remaining candidates
      pids = remaining.map do |k|
        pid = fork do
          clusterer = new(vectors, k)
          clusterer.fit
          score = clusterer.silhouette_score
          result = { k: clusterer.k, score: score, centroids: clusterer.centroids,
                     assignments: clusterer.assignments }
          # Write to tmp file then rename for atomicity
          tmp = File.join(work_dir, "k_#{k}.tmp")
          final = File.join(work_dir, "k_#{k}.marshal")
          File.write(tmp, Marshal.dump(result))
          File.rename(tmp, final)
          $stdout.puts "  k=#{k}: silhouette=#{score.round(4)}, #{clusterer.k} non-empty clusters"
          $stdout.flush
        end
        { pid: pid, k: k }
      end

      # Wait for all children
      pids.each { |job| Process.wait(job[:pid]) }

      # Load results from disk
      remaining.each do |k|
        result_file = File.join(work_dir, "k_#{k}.marshal")
        done[k] = Marshal.load(File.read(result_file))
      end
    end

    results = done.values
    best = results.max_by { |r| r[:score] }
    puts "\nBest k=#{best[:k]} (silhouette=#{best[:score].round(4)})"

    # Reconstruct the winning clusterer
    clusterer = new(vectors, best[:k])
    clusterer.instance_variable_set(:@centroids, best[:centroids])
    clusterer.instance_variable_set(:@assignments, best[:assignments])
    clusterer.instance_variable_set(:@k, best[:k])
    clusterer
  end

  private

  def nearest_centroid(vector)
    best_idx = 0
    best_dist = Float::INFINITY

    @centroids.each_with_index do |centroid, idx|
      dist = squared_distance(vector, centroid)
      if dist < best_dist
        best_dist = dist
        best_idx = idx
      end
    end

    best_idx
  end

  def squared_distance(a, b)
    sum = 0.0
    a.each_with_index { |val, i| d = val - b[i]; sum += d * d }
    sum
  end

  def cosine_similarity(a, b)
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    a.each_with_index do |val, i|
      dot += val * b[i]
      norm_a += val * val
      norm_b += b[i] * b[i]
    end
    return 0.0 if norm_a == 0 || norm_b == 0
    dot / (Math.sqrt(norm_a) * Math.sqrt(norm_b))
  end

  def mean_vector(vectors)
    n = vectors.length.to_f
    result = Array.new(@dim, 0.0)
    vectors.each do |v|
      v.each_with_index { |val, i| result[i] += val }
    end
    result.map { |val| val / n }
  end

  def remove_empty_clusters
    occupied = @assignments.uniq.sort
    return if occupied.length == @k

    # Remap cluster IDs to be contiguous
    id_map = {}
    occupied.each_with_index { |old_id, new_id| id_map[old_id] = new_id }

    @centroids = occupied.map { |old_id| @centroids[old_id] }
    @assignments = @assignments.map { |a| id_map[a] }
    @k = occupied.length
  end

  def silhouette_for_point(i)
    my_cluster = @assignments[i]

    # a(i) = mean distance to same-cluster points
    same = @vectors.each_with_index
      .select { |_, j| j != i && @assignments[j] == my_cluster }
      .map { |v, _| squared_distance(@vectors[i], v) }

    return 0.0 if same.empty?
    a = same.sum / same.length.to_f

    # b(i) = min mean distance to any other cluster
    other_clusters = (0...@k).reject { |c| c == my_cluster }
    return 0.0 if other_clusters.empty?

    b = other_clusters.map do |c|
      members = @vectors.each_with_index
        .select { |_, j| @assignments[j] == c }
        .map { |v, _| squared_distance(@vectors[i], v) }
      members.empty? ? Float::INFINITY : members.sum / members.length.to_f
    end.min

    max_ab = [a, b].max
    max_ab == 0 ? 0.0 : (b - a) / max_ab
  end
end
