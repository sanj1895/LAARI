# LAARI - a HPC Risk Analysis Platform

A platform that makes high-performance computing accessible for financial risk analysis. Analysts can run massive simulations without knowing anything about clusters, schedulers, or parallel computing. Just describe what you want in plain English, and the system does the rest.

---

##  Why We Built This

Financial risk simulations often require running millions of scenarios. Traditional HPC setups are powerful but complicated—analysts shouldn't have to worry about cores, nodes, or cloud costs to get results.  

Our goal: let users focus on *what they want to test*, not *how to run it*. HPC is powerful, but it should be invisible.

---

##  Features

### Plain-English Job Submission
Type requests like:

> "Stress test my portfolio under extreme market volatility."

The system:
- Figures out the type of analysis  
- Picks parameters like volatility and depth  
- Generates the HPC job automatically  

No technical knowledge required.

---

### Smart Workload Routing
Jobs automatically run where it makes sense:

- **Local WebGPU** for free, small-scale jobs  
- **Cloud HPC clusters** for time-critical or high-load jobs  
- **Hybrid mode** to balance cost and performance  

High-risk scenarios get more parallel workers automatically, while routine checks save resources.

---

### Massive-Scale Processing
- Millions of scenarios in parallel  
- Hundreds of millions of data points  
- Results in seconds instead of minutes or hours  

Everything is handled behind the scenes—users just see results.

---

### Executive-Ready Reports
Instead of raw metrics, users get insights they can act on:  
- Risk levels (Critical / High / Moderate / Low)  
- Financial impact in dollars  
- Recommendations for next steps  

Reports are HTML-based and presentation-ready. Shareable with stakeholders without extra work.

---

### Persistent Data & Security
All results are stored in MongoDB so you can:  
- Compare current vs past simulations  
- Track portfolio risk trends  
- Keep data secure with Auth0 authentication  

Each analyst gets a private workspace where simulation history is protected and accessible only to authorized users.

---

### Real-Time Monitoring
Users can watch:  
- Job progress  
- Resource usage (CPU/GPU/Cloud)  
- Latency and performance metrics  
- Cost breakdowns  

Everything updates live, so you know what's happening at all times.

---

##  Tech Stack
- **Frontend:** React + TypeScript  
- **Backend:** Node.js + Express  
- **Database:** MongoDB  
- **Authentication:** Auth0  
- **Compute:** Local WebGPU + Cloud HPC  
- **AI:** Google Gemini API, Groq API  

---

##  How It Works
1. User submits a request in natural language.  
2. Gemini interprets it and creates a structured HPC job.  
3. The scheduler routes the job intelligently across compute resources.  
4. The job runs in parallel and results are aggregated.  
5. Gemini generates a plain-language report with actionable insights.  
6. Results are securely stored in MongoDB with Auth0-protected access.

All steps are automated—users never touch the HPC layer.

---

##  Why It's Cool
- HPC without the headache  
- Automatic cost optimization  
- Real-time insights  
- Secure, authenticated access to simulation history
- Reports that make sense to humans, not machines  

Basically, you get all the power of HPC without the learning curve.

---

## Getting Started
```bash
# Clone the repo
git clone https://github.com/your-username/hpc-risk-analysis.git

# Install dependencies
npm install

# Start the frontend
npm start

# Start the backend
npm run dev

# Submit a simulation and check results
```

---

