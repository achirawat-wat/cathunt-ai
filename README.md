# CatHunt

CatHunt is an AI-powered social platform that transforms everyday cat sightings into a collaborative community database.

Instead of simply sharing cat photos, CatHunt uses computer vision and vector search technology to identify individual cats, allowing users to rediscover familiar feline friends, follow their journeys, and contribute to a growing community-driven knowledge base.

## 🌐 Live Demo

https://cathunt-ai.vercel.app/

---

# Overview

CatHunt combines social networking, geolocation, and artificial intelligence to solve a surprisingly difficult problem:

**How can people recognize whether a cat they've just encountered is one they've seen before?**

Using Vision AI and vector similarity search, CatHunt identifies individual cats from photographs rather than relying on manual tagging or names.

Every sighting enriches the database, allowing the AI model to continuously improve its recognition accuracy while building a community-powered history of each cat.

Rather than being another photo-sharing application, CatHunt functions as a **Community Cat Database** powered by modern AI technologies.

---

# Features

## AI Cat Identification

* AI-powered individual cat recognition
* Multi-view registration (Front, Left, Right)
* Automatic image embedding generation
* Vector similarity search
* Self-improving recognition through additional sightings
* Automatic cat cropping using object detection

## Smart Recognition Workflow

* AI suggests the most likely matching cat
* Manual override when AI is uncertain
* Register new cats instantly
* Confidence-based ranking system
* Context-aware candidate recommendations

## Community Feed

* Share cat sightings
* Like and comment on posts
* Follow your favorite cats
* View community activity
* Discover recently spotted cats

## Geolocation Tracking

* GPS location recording
* Automatic Reverse Geocoding
* Location history for every cat
* Community-based sighting timeline

## Data Integrity

* Human verification for AI predictions
* Community-assisted identity correction
* Continuous dataset improvement
* Reliable identity management

---

# Tech Stack

## Frontend

* Next.js (App Router)
* React
* TypeScript
* Tailwind CSS
* Lucide React

## AI & Computer Vision

* Jina AI CLIP (jina-clip-v1)
* Hugging Face DETR (detr-resnet-50)
* Sharp

## Backend

* Supabase
* PostgreSQL
* pgvector

## Storage

* Supabase Storage

---

# Architecture Highlights

## Vision AI Pipeline

1. Upload image
2. Detect cat using Object Detection
3. Crop image automatically
4. Generate 768-dimensional embedding with CLIP
5. Search similar vectors using pgvector
6. Return the closest matching cats
7. Allow user confirmation or correction

## Multi-View Training

Unlike traditional image recognition systems that rely on a single reference image, CatHunt requires three different viewing angles when registering a new cat.

* Front View
* Left Side
* Right Side

This significantly improves recognition accuracy when future sightings are captured from different perspectives.

## Self-Improving AI

Every confirmed sighting generates additional embeddings that are stored alongside previous vectors.

As more users upload photos of the same cat under different lighting conditions, poses, and camera angles, the recognition engine continuously becomes more accurate without retraining the AI model itself.

## Vector Search Engine

CatHunt stores image embeddings inside PostgreSQL using **pgvector**, enabling fast similarity searches across thousands of registered cats.

Instead of comparing filenames or metadata, the system compares the visual characteristics of each cat mathematically, allowing highly accurate identity matching.

---

# Key Problem Solved

Most social platforms answer the question:

> "Where was this photo posted?"

CatHunt answers a far more challenging question:

> **"Have I met this cat before?"**

By combining object detection, vision-language models, and vector databases, CatHunt can recognize individual cats across different photos, locations, and time periods.

The result is a community-powered AI system that helps users rediscover familiar cats, follow their movements, and contribute to a shared knowledge base.

---

# Future Roadmap

* Interactive Cat Territory Map
* Heatmap visualization of cat movements
* AI behavior analysis
* Best time to find each cat
* Hunter leaderboard
* Achievement badges
* Founder recognition system
* Lost & injured cat reporting
* Push notifications for followed cats
* Advanced analytics dashboard

---

# Author

**Achirawat Wattanaworapant**

Full-Stack Developer | AI Engineer
