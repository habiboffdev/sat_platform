---
description: How to deploy the SAT Platform (Backend to Heroku, Frontend to Vercel)
---

# Deploy Backend to Heroku

1. Navigate to backend directory: `cd backend`
2. Initialize git if not done: `git init`
3. Create Heroku app: `heroku create sat-platform-backend`
4. Set stack to container: `heroku stack:set container`
5. Add addons:
   - `heroku addons:create heroku-postgresql:essential-0`
   - `heroku addons:create heroku-redis:mini`
6. Push to Heroku: `git push heroku main`

# Deploy Frontend to Vercel

1. Navigate to frontend directory: `cd frontend`
2. Run build locally to verify: `npm run build`
3. Deploy using Vercel CLI: `vercel --prod`
4. Set environment variable: `vercel env add VITE_API_URL`
