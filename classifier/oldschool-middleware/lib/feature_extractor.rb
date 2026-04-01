# frozen_string_literal: true

class FeatureExtractor
  VOWELS = /[aeiouy]/i

  def initialize(text)
    @text = text.to_s
    @words = @text.split(/\s+/).reject(&:empty?)
    @downcase_words = @words.map(&:downcase)
    @sentences = @text.split(/[.!?]+/).map(&:strip).reject(&:empty?)
  end

  def extract
    @extract ||= {}.merge(length_signals)
      .merge(vocabulary_signals)
      .merge(readability_signals)
      .merge(structure_signals)
      .merge(keyword_signals)
      .merge(meta_signals)
  end

  # Returns ordered array of feature values (for model input)
  def feature_vector
    FEATURE_ORDER.map { |key| extract[key].to_f }
  end

  FEATURE_ORDER = %i[
    char_count word_count sentence_count avg_sentence_length avg_word_length
    type_token_ratio long_word_ratio rare_word_count syllable_count
    flesch_kincaid_grade ari
    question_mark_count comma_count conjunction_count
    preposition_count subordinate_count
    complexity_keyword_count simplicity_keyword_count code_keyword_count
    multi_part_count enumeration_request jargon_density
    starts_with_question_word topic_shift_count ends_with_question
  ].freeze

  private

  def length_signals
    word_count = @words.length
    sentence_count = [@sentences.length, 1].max
    char_count = @text.length

    {
      char_count: char_count,
      word_count: word_count,
      sentence_count: @sentences.length,
      avg_sentence_length: word_count.zero? ? 0 : word_count.to_f / sentence_count,
      avg_word_length: word_count.zero? ? 0 : @words.sum(&:length).to_f / word_count
    }
  end

  def vocabulary_signals
    return { type_token_ratio: 0, long_word_ratio: 0, rare_word_count: 0, syllable_count: 0 } if @words.empty?

    unique = @downcase_words.uniq.length
    long = @words.count { |w| w.length > 6 }
    rare = @words.count { |w| w.length > 8 }

    {
      type_token_ratio: unique.to_f / @words.length,
      long_word_ratio: long.to_f / @words.length,
      rare_word_count: rare,
      syllable_count: @words.sum { |w| estimate_syllables(w) }
    }
  end

  def readability_signals
    word_count = @words.length.to_f
    sentence_count = [@sentences.length, 1].max.to_f
    return { flesch_kincaid_grade: 0, ari: 0 } if word_count.zero?

    syllables = @words.sum { |w| estimate_syllables(w) }.to_f
    char_count = @words.sum(&:length).to_f # letters only, no spaces

    fk = 0.39 * (word_count / sentence_count) + 11.8 * (syllables / word_count) - 15.59
    ari = 4.71 * (char_count / word_count) + 0.5 * (word_count / sentence_count) - 21.43

    { flesch_kincaid_grade: fk.round(2), ari: ari.round(2) }
  end

  def structure_signals
    text_down = @text.downcase

    {
      question_mark_count: @text.count('?'),
      comma_count: @text.count(','),
      conjunction_count: count_words(text_down, %w[and or but however although]),
      preposition_count: count_words(text_down, %w[of in for with between]),
      subordinate_count: count_words(text_down, %w[which that because while whereas])
    }
  end

  def keyword_signals
    text_down = @text.downcase

    complexity_words = %w[analyze compare implement explain evaluate discuss implications differences optimize design]
    simplicity_phrases = ["what is", "who is", "define", "list", "name", "when did", "where is"]
    code_phrases = ["write a", "implement", "function", "algorithm", "code"]
    multi_part = ["and also", "in addition", "furthermore", "as well as", "versus"]
    enum_phrases = ["list", "name all", "enumerate"]
    jargon_suffixes = %w[tion ment ology ysis]

    {
      complexity_keyword_count: count_words(text_down, complexity_words),
      simplicity_keyword_count: simplicity_phrases.count { |p| text_down.include?(p) },
      code_keyword_count: code_phrases.count { |p| text_down.include?(p) },
      multi_part_count: multi_part.count { |p| text_down.include?(p) },
      enumeration_request: enum_phrases.any? { |p| text_down.include?(p) } ? 1 : 0,
      jargon_density: @downcase_words.count { |w| jargon_suffixes.any? { |s| w.end_with?(s) } }
    }
  end

  def meta_signals
    question_starters = %w[what who when where how why can does]
    first_word = @downcase_words.first.to_s.gsub(/[^a-z]/, '')

    {
      starts_with_question_word: question_starters.include?(first_word) ? 1 : 0,
      topic_shift_count: @text.count(',') + count_words(@text.downcase, %w[and]),
      ends_with_question: @text.strip.end_with?('?') ? 1 : 0
    }
  end

  def estimate_syllables(word)
    w = word.downcase.gsub(/[^a-z]/, '')
    return 1 if w.length <= 2
    # Count vowel groups
    count = w.scan(/[aeiouy]+/).length
    # Subtract silent e
    count -= 1 if w.end_with?('e') && !w.end_with?('le')
    [count, 1].max
  end

  def count_words(text, words)
    words.sum { |w| text.scan(/\b#{Regexp.escape(w)}\b/).length }
  end
end
