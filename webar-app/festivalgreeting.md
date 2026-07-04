# PRODUCT ROADMAP: AI-GENERATED FESTIVAL GREETINGS FEATURE
*Version:* 1.0 (Initial MVP Launch)  
*Objective:* Enable admins to manually trigger personalized, AI-generated festival images to all active subscribers via in-app notifications and email.

---

### Phase 1: Backend Admin Trigger Interface
Instead of an automated tracking system, the admin will control the blast from a simple backend dashboard.

* *Input Form Setup:* Build an admin dashboard interface with three key fields:
    * *Festival Name:* (e.g., "Diwali", "New Year", "Christmas")
    * *Custom Prompt Text:* Style modifiers for the AI (e.g., "vibrant, cinematic lighting, watercolor style")
    * *Overlay Text:* The greeting message (e.g., "Wishing you a year filled with joy and success!")
* *Targeting Logic:* Create a database query to fetch all active users, retrieving only their user_name and email.
* *Action Trigger:* A "Send Blast" button that sends the data to a background processing system to avoid freezing the browser.

---

### Phase 2: Dynamic Image Generation & Text Overlay
This step builds the custom image using the admin's inputs while handling AI text limitations safely.

* *API Integration:* Connect the backend to an image generation API (like OpenAI's DALL-E 3 or Stability AI).
* *Dynamic Prompt Builder:* Combine the admin input into a structured prompt focused only on the background asset to avoid AI spelling errors:
    * Template: "A beautiful, high-quality holiday graphic for [Admin's Festival Name], [Admin's Custom Prompt Text], clean background, strictly no text."
* *Text Overlay Engine:* Use a backend programmatic image library (e.g., Python's Pillow or Node.js Sharp) to stamp the text perfectly onto the generated asset.
    * Rendered Text Structure: "Happy [Festival Name], [User_Name]! \n [Admin's Overlay Text]"

---

### Phase 3: Background Worker Queue
Generating unique images for all users at once will cause API rate limit errors or crash the server. A queue is mandatory.

* *Queue Manager Setup:* Implement a robust queue framework (like BullMQ for Node.js, Celery for Python, or AWS SQS).
* *Worker Execution Flow:* For each individual user in the queue, the worker must:
    1. Call the AI API to get the base background image.
    2. Pass the image to the Text Overlay Engine to add the personalized name and text.
    3. Upload the final compiled image to a public cloud storage bucket.
    4. Save the resulting image URL back to the user's notification table in the database.

---

### Phase 4: Delivery Pipeline
Once a worker finishes a specific user's image, it instantly triggers delivery across both channels.

* *In-App Notification:* Insert a new row into the application's notification feed table containing the unique image URL. It will instantly render on the user's dashboard upon their next login.
* *Email Dispatch:* Pass the user's email address and the hosted image URL to a transactional email service (like Mailgun, or Postmark). 
* *HTML Template:* Fire a responsive email template where the AI image is embedded as the central visual piece.

---

# TECHNICAL SPECIFICATION: AI FESTIVAL GREETING IN-APP & EMAIL BLAST SYSTEM

## 1. OBJECTIVE
Build a backend administrative feature that allows an admin to manually trigger a personalized, AI-generated festival image blast to all active users. The system must generate a unique background using a text-to-image API, overlay the user's registered name programmatically to avoid AI typos, store the asset, and deliver it via both an in-app notification feed and email.

## 2. SYSTEM ARCHITECTURE & DATA FLOW
1. Admin submits form (Festival Name, Style Prompt, Custom Greeting) via Admin Panel.
2. Backend validates input, fetches all active users (user_name, email), and pushes individual tasks to a background worker queue.
3. Queue processes tasks sequentially to manage rate limits:
   a. Call Text-to-Image API using Admin inputs to get a base graphic (no text).
   b. Use an image processing library to overlay text: "Happy [Festival Name], [user_name]! [Custom Greeting]".
   c. Upload final composite image to Cloud Storage.
   d. Write notification record to DB.
   e. Send transactional email with the image URL.

## 3. COMPONENT DETAILS

### A. Admin Dashboard Form (Phase 1)
- Inputs: festival_name (string), style_prompt (string), overlay_text (string).
- Action: POST request to /api/admin/festival-blast.

### B. Image Generation & Processing (Phase 2)
- Image API Prompt Template: "A beautiful, high-quality holiday graphic for ${festival_name}, ${style_prompt}, clean background, abstract composition, strictly no text, digital art format."
- Overlay Mechanics: Center-align text or bottom-third align text over the base image using standard font configurations.

### C. Queue & Background Worker (Phase 3)
- Must use a background worker queue to prevent timeout and handle API rate limits.
- Failed tasks should retry up to 3 times with exponential backoff.

### D. Delivery (Phase 4)
- DB Schema for Notification: id, user_id, image_url, is_read, created_at.
- Email: Send via transactional email provider with a simple responsive HTML body embedding the image URL.

---

## 4. TECH STACK (TO BE CONFIRMED)
- Backend Language/Framework: Node.js (Express) / Python (FastAPI) / etc.
- Database: PostgreSQL / MongoDB / etc.
- Image API Choice: OpenAI DALL-E 3 / Stability AI
- Queue System: BullMQ (Redis) / Celery / etc.
- Image Library: Sharp (Node) / Pillow (Python)
- Email Service: SendGrid / Mailgun / AWS SES

---

## 5. BUILD PROMPTS (Module by Module)

### Prompt 1: Database and Admin Route (Phase 1)
"Write the backend API endpoint (POST /api/admin/festival-blast) and the database query to fetch active users. Also, include the logic that takes these users and initializes them into our queue system."

### Prompt 2: Core Worker and Image AI Integration (Phase 2 & 3)
"Build the background worker processor. Write the worker code that processes a single user job. It should format the dynamic prompt, call the text-to-image API, handle the API response, and pass the downloaded image buffer to the next step. Ensure there is error handling for API timeouts or rate limits."

### Prompt 3: Programmatic Text Overlay (Phase 2 Engine)
"Write the image processing helper function. This function should take the raw AI-generated image buffer, overlay the text 'Happy [Festival Name], [user_name]!' and the admin's custom text onto it nicely (handling text wrapping and font scaling so long names don't break), and output the final image buffer."

### Prompt 4: Cloud Upload & Database Save (Phase 3 Wrap-up)
"Modify the worker so that after the text is overlaid, it uploads the final image buffer to our cloud storage bucket, retrieves the public URL, and inserts a new notification record into our database for that user."

### Prompt 5: Email Delivery Integration (Phase 4)
"Complete the worker task by adding the email delivery code. Generate a clean, responsive HTML email template string that contains the user's name and centers the generated image URL. Connect this template to our transactional email service provider code to send the email."
