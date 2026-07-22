---
title: "Inadvertently becoming a slop contributor to rust core library"
description: ""
pubDate: 2026-07-22
tags: []
draft: false
---

I was surprised to see an email notification for the [rust-lang/libc repo](https://github.com/rust-lang/libc) since I don't normally contribute to rust projects. 

![Github Alert](/personalSite/images/inadvertently-becoming-a-slop-contributor-to-rust-libc-1.png)

Looking at it my Claude Code agent had went an opened an issue on a bug it found in `libc`. The issue itself was actually pretty well constructed with repro ability. 

After I saw the response I more manually drove a useful response to help the maintainer and then the regression got fixed promptly:
![](/personalSite/images/inadvertently-becoming-a-slop-contributor-to-rust-libc-2.png)

## How this happened
I maintain [omniLua](https://github.com/ianm199/omnilua) where a [user had reported a bug](https://github.com/ianm199/omnilua/issues/308) -> I had Claude Fable go and fix it. It in the process correctly identified that day there had been a regression in the `libc` repo and reported it.

## Takeaways
It feels like running frontier coding agents in "YOLO mode" on your machine are becoming less likely to [`rm -rf` your database](https://www.docker.com/blog/coding-agent-horror-stories-the-rm-rf-incident/), though that still might happen, but more likely to go out and take actions that you might or might not be OK with. Whether its opening an issue on someone's github, "borrowing" your browser tokens to reverse engineer an API for itself, or [hacking hugging face](https://www.theguardian.com/technology/2026/jul/22/openai-says-its-models-went-rogue-and-hacked-startup-in-unprecedented-incident).

Most people don't want to manually approve permissions unless there is a serious reason to do so, and AI Agents might just find a way around these anyway. It feels like the 1st step should be to write a .md stating in general what you are OK with and not in terms of effect on the outside world. A deeper step might be an AI agent that is smaller than your main one and can quickly vibecheck and supervise the actions, with the ability to hit the kill switch if the actions are too confusing or seem misaligned. The only thing that can stop a bad agent is... a good agent?

## Software 
Many people think that AI is going to keep [pushing software towards slop](https://arxiv.org/abs/2603.28592?utm_source=chatgpt.com) but this could be a bullish example on software quality. For something quite important - `libc` - a regression was caught quickly and efficiently, and in my own project I was able to quickly fix the issue + add a better CI setup so users don't get broken builds.

