---
title: "Just use best practices everywhere"
description: "Easier to implement best practices and now you get more leverage"
pubDate: 2026-07-13
tags: ["ai", "random"]
draft: false
---

## The ROI on following best practices has fundamentally changed
Following [best practices](https://en.wikipedia.org/wiki/Best_practice) has always paid off — if you do a lot of something, there are clean returns to doing it the right way. But there was always a cost that came out of the main thing: learning them, setting them up, maintaining them. What's changed is both sides of that equation at once. AI made best practices dramatically cheaper to adopt, and — because AI is far more useful on top of clean logs, organized data, and good tooling — following them pays back more than it ever has.

<figure style="margin: 32px 0;">
<svg viewBox="0 0 640 462" role="img" aria-label="The cost-payoff plane. AI compresses the cost axis and stretches the payoff axis, so the break-even line swings down. The shaded wedge between the old and new break-even lines marks practices that just became worth adopting." style="width: 100%; height: auto; display: block; font-family: var(--font-mono);">
<title>AI as a linear transformation of the cost-payoff plane</title>
<polygon points="56,376 404,28 624,28 624,281" fill="var(--bg-elevated)" />
<line x1="56" y1="376" x2="404" y2="28" stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="7 7" />
<line x1="56" y1="376" x2="624" y2="281" stroke="var(--text-primary)" stroke-width="2" />
<path d="M 162 270 A 150 150 0 0 1 203.9 351.4" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="2 4" />
<polygon points="205,358.3 200.4,351.9 207.4,350.8" fill="var(--text-muted)" />
<line x1="56" y1="376" x2="617" y2="376" stroke="var(--border)" stroke-width="1.25" />
<line x1="56" y1="376" x2="56" y2="35" stroke="var(--border)" stroke-width="1.25" />
<polygon points="624,376 615,372 615,380" fill="var(--border)" />
<polygon points="56,28 52,37 60,37" fill="var(--border)" />
<circle cx="150" cy="170" r="5.5" fill="var(--text-primary)" />
<circle cx="235" cy="95" r="5.5" fill="var(--text-primary)" />
<circle cx="120" cy="255" r="5.5" fill="var(--text-primary)" />
<circle cx="300" cy="270" r="8" fill="none" stroke="var(--text-primary)" stroke-width="1.5" />
<circle cx="300" cy="270" r="3.5" fill="var(--text-primary)" />
<circle cx="360" cy="185" r="8" fill="none" stroke="var(--text-primary)" stroke-width="1.5" />
<circle cx="360" cy="185" r="3.5" fill="var(--text-primary)" />
<circle cx="465" cy="140" r="8" fill="none" stroke="var(--text-primary)" stroke-width="1.5" />
<circle cx="465" cy="140" r="3.5" fill="var(--text-primary)" />
<circle cx="535" cy="235" r="8" fill="none" stroke="var(--text-primary)" stroke-width="1.5" />
<circle cx="535" cy="235" r="3.5" fill="var(--text-primary)" />
<circle cx="445" cy="345" r="5.5" fill="var(--bg)" stroke="var(--text-muted)" stroke-width="1.5" />
<circle cx="570" cy="330" r="5.5" fill="var(--bg)" stroke="var(--text-muted)" stroke-width="1.5" />
<text x="50" y="17" text-anchor="end" font-size="14" fill="var(--text-secondary)">payoff</text>
<text x="404" y="17" text-anchor="middle" font-size="13" fill="var(--text-secondary)">old break-even &#8212; payoff = cost</text>
<text x="460" y="296" text-anchor="middle" font-size="13" fill="var(--text-secondary)" transform="rotate(-9.5 460 296)">new break-even &#8212; payoff = (&#945;/&#946;) &#183; cost</text>
<text x="480" y="95" text-anchor="middle" font-size="14" fill="var(--text-primary)">everything in here</text>
<text x="480" y="114" text-anchor="middle" font-size="14" fill="var(--text-primary)">just became worth it</text>
<text x="150" y="60" text-anchor="middle" font-size="14" fill="var(--text-secondary)">always worth it</text>
<text x="490" y="364" text-anchor="middle" font-size="14" fill="var(--text-secondary)">still skip</text>
<text x="340" y="404" text-anchor="middle" font-size="14" fill="var(--text-secondary)">cost to adopt</text>
<text x="340" y="430" text-anchor="middle" font-size="13" fill="var(--text-muted)">x-axis squashed &#8212; AI does the setup, so every cost gets &#247; &#945;</text>
<text x="340" y="450" text-anchor="middle" font-size="13" fill="var(--text-muted)">y-axis stretched &#8212; AI uses the output, so every payoff gets &#215; &#946;</text>
</svg>
</figure>

### Examples of best practices in software development
* If you have access to observability and performance tooling like Datadog or Grafana, actually using them and putting in the legwork to create the right metrics, alerts, and profiling
  * E.g. setting up session replay on critical routes, creating the right custom metrics, setting up performance profiling in a way that won't nuke your spend
  * **Change:** AI agents can learn all the [DSLs](https://docs.datadoghq.com/ddsql_editor/) you don't care about and use them to their fullest in order to make actually helpful alerts and dashboards
* Remove PII, secrets, and anything else that shouldn't be there from application logs. Actually logging things in a way where "errors" are problematic or ideally unexpected behavior
  * **Change:** you can now have AI do lots of audits on your code and make sure only the right things are getting logged, and once everything is clean you can in good faith point AI agents at your logs in order to debug issues
* Have a serious test suite that can actually replicate most production errors
  * If you are running a standard backend API most backend APIs can reproduce most errors with a database that matches prod schema, realistic DB state, and mocking all network calls
  * **Change:** probably still needs some guiding, but AI agents can set up a lot of the infrastructure for these, and then once they are actually good and in a place where tests can just be added, you can just mock production errors, confirm root cause, and have a big test suite built over time.

## Best practices in personal information management
I realized that personally and professionally using best practices is more important than ever. Here are some examples:

* Keep everything on your calendar, and sync all your calendars to one calendar
  * You can hook your AI agents into your calendar and get more personalized results. E.g. "give me some ideas for how to spend my afternoon" and it may be able to tell that evening I am going to a dinner in a certain neighborhood in NYC so it makes sense to go to a famous sports bar nearby and watch the World Cup game
  * AI can take a look at your calendar and do research on important events. E.g. if you are meeting someone about a job opportunity it can prepare notes for you
* For anything that is your "source of truth", prioritize services that let you actually pull the data out
  * E.g. Strava only lets you pull your data out if you are a premium member, ideally make a running watch your source of truth and then pull the data from there
  * **Change:** it was always nice to have access to your data, but I was always going to be too lazy to take advantage of it

## Some examples of myself using this lately

* Datadog logs our % of time on an outbound request heavy service. On a service that does ~2 million a day of requests we were spending about 20% of total time on the Python `requests` package doing `requests.get`, `requests.post`.
  * Ended up moving our service to IaC, parameterizing the core items around concurrency and instance numbers
  * Being able to tie those changes in VCS to our Datadog led to reducing costs by > 50% and better performance
* I had Claude do an audit of how we were using Datadog - cleared out tons of stale alerts, fixed bugs in our core dashboard, and started tracking metrics in a way that was actually useful to the business
* I synced all my calendars to one, including external event services like Partiful, so that I can get personalized reminders on events I have coming up.
  * For example I have a potluck coming up, so I will get some alerts from my agent to actually cook some food for that before it
  * I have an OpenClaw agent that runs at the beginning of the day and tells me if I have anything to do before these meetings

## AI or not, these were all best practices to begin with
Software logs are supposed to be squeaky clean, your work and life should be organized, you should use industry best practices like observability etc. The difference is that now these are the difference between AI being moderately useful and incredibly helpful in organizing your life and work.

## Best practices are often what determines if you actually get leverage from AI
If you aren't using best practices — your data is accessible, safe to access, organized right — you just won't get a lot of return from AI. These kinds of things were previously arduous to set up and maintain correctly, and now it is much easier. Previously the benefits existed but were often diffuse. Now you can directly get benefits.

## Implications

There is a lot of talk of whether or not AI will actually lead to productivity increases since so far it has been hard to measure. I wonder if in information related fields we will see a rise for no other reason than all production Python code will end up getting type hints properly or issues surfaced by logging might actually get read. People can generally ask "how to make my code more reliable" and get told they need to account for `requests.ConnectionError` and `requests.ReadTimeout` properly.

For myself the main reason I'm writing this is to remind myself when working on something to step back and be like "Am I leveraging the best practices here? How hard would that be to get to?" and "Is AI able to grok this part of the problem I'm working on or this aspect of my life so that it can assist?". In the long run hopefully I will be more organized and productive.
