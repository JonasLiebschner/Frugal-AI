FROM ruby:3.3-slim

RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY oldschool-middleware/Gemfile oldschool-middleware/Gemfile.lock ./
RUN bundle config set without 'test' && bundle install

COPY oldschool-middleware/ .

EXPOSE 3005

CMD ["bundle", "exec", "ruby", "app.rb", "-o", "0.0.0.0"]
