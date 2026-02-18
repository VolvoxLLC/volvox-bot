#!/bin/bash
# =============================================================================
# Seed Demo Data for Product Hunt Demo
# =============================================================================
# Creates realistic, impressive demo data for Veritas Kanban v3.0
# Port: 3099 (demo instance)
# =============================================================================

set -euo pipefail

API_BASE="http://localhost:3099/api"

echo "🌱 Seeding Veritas Kanban demo data..."

# -----------------------------------------------------------------------------
# Helper function to create tasks
# -----------------------------------------------------------------------------
create_task() {
  local title="$1"
  local description="$2"
  local project="$3"
  local status="$4"
  local priority="$5"
  local type="$6"
  
  local payload
  payload=$(cat <<EOF
{
  "title": "${title}",
  "description": "${description}",
  "project": "${project}",
  "status": "${status}",
  "priority": "${priority}",
  "type": "${type}"
}
EOF
)

  local attempt=0
  while true; do
    attempt=$((attempt+1))

    # Note: VK applies write rate-limiting. We retry with backoff.
    local resp
    resp=$(curl -s -X POST "$API_BASE/tasks" \
      -H "Content-Type: application/json" \
      -H "X-API-Key: demo-admin-key-for-product-hunt-2026" \
      -d "$payload")

    if echo "$resp" | grep -q '"success":true'; then
      echo "  ✓ Created: $title ($status)"
      # Small delay to avoid triggering write rate limit
      sleep 2
      break
    fi

    # If rate-limited, back off and retry
    if echo "$resp" | grep -q 'Too many write requests'; then
      if [ "$attempt" -ge 8 ]; then
        echo "  ✗ Failed (rate limit): $title" >&2
        echo "$resp" | head -c 400 >&2
        exit 1
      fi
      sleep 5
      continue
    fi

    echo "  ✗ Failed: $title" >&2
    echo "$resp" | head -c 800 >&2
    exit 1
  done
}

# -----------------------------------------------------------------------------
# BRAINMELD TASKS
# -----------------------------------------------------------------------------
echo ""
echo "📦 Creating BrainMeld tasks..."

create_task \
  "Implement AI-powered document summarization" \
  "Add GPT-4 integration for automatic document summarization. Extract key insights and create markdown summaries." \
  "brainmeld" \
  "done" \
  "high" \
  "feature"

create_task \
  "Design knowledge graph visualization" \
  "Create interactive D3.js visualization showing connections between documents, tags, and concepts." \
  "brainmeld" \
  "done" \
  "medium" \
  "design"

create_task \
  "Add semantic search with vector embeddings" \
  "Integrate Pinecone for vector search. Generate embeddings for all documents and enable natural language queries." \
  "brainmeld" \
  "in-progress" \
  "high" \
  "feature"

create_task \
  "Build collaborative annotation system" \
  "Allow multiple users to highlight and comment on shared documents in real-time." \
  "brainmeld" \
  "in-progress" \
  "medium" \
  "feature"

create_task \
  "Research RAG architecture patterns" \
  "Evaluate different retrieval-augmented generation approaches for knowledge Q&A system." \
  "brainmeld" \
  "todo" \
  "high" \
  "research"

create_task \
  "Optimize document parsing for large PDFs" \
  "Current parser struggles with 100+ page PDFs. Profile and optimize performance." \
  "brainmeld" \
  "todo" \
  "medium" \
  "bug"

# -----------------------------------------------------------------------------
# DEALMELD TASKS
# -----------------------------------------------------------------------------
echo ""
echo "🤝 Creating DealMeld tasks..."

create_task \
  "Build digital sales room template system" \
  "Create customizable templates for different deal types (SaaS, consulting, enterprise)." \
  "dealmeld" \
  "done" \
  "high" \
  "feature"

create_task \
  "Add document engagement analytics" \
  "Track which pages prospects view, time spent, and engagement patterns." \
  "dealmeld" \
  "done" \
  "high" \
  "feature"

create_task \
  "Implement e-signature integration" \
  "Integrate DocuSign and HelloSign for in-app contract signing." \
  "dealmeld" \
  "in-progress" \
  "high" \
  "feature"

create_task \
  "Design stakeholder collaboration features" \
  "Enable multiple decision-makers on buyer side to collaborate within the deal room." \
  "dealmeld" \
  "todo" \
  "medium" \
  "design"

create_task \
  "Research mutual action plan best practices" \
  "Study how top sales teams structure MAPs. Interview 10+ sales leaders." \
  "dealmeld" \
  "todo" \
  "low" \
  "research"

# -----------------------------------------------------------------------------
# MESSAGEMELD TASKS
# -----------------------------------------------------------------------------
echo ""
echo "💬 Creating MessageMeld tasks..."

create_task \
  "Add Discord and Telegram support" \
  "Extend cross-platform messaging to Discord and Telegram in addition to existing platforms." \
  "messagemeld" \
  "done" \
  "high" \
  "feature"

create_task \
  "Fix message sync race condition" \
  "Occasional duplicate messages when multiple platforms receive the same message simultaneously." \
  "messagemeld" \
  "in-progress" \
  "high" \
  "bug"

create_task \
  "Build unified notification system" \
  "Aggregate notifications from all platforms into single intelligent feed." \
  "messagemeld" \
  "todo" \
  "medium" \
  "feature"

create_task \
  "Design thread unification UI" \
  "Show how conversations across platforms can be merged into coherent threads." \
  "messagemeld" \
  "todo" \
  "medium" \
  "design"

# -----------------------------------------------------------------------------
# INFRASTRUCTURE TASKS
# -----------------------------------------------------------------------------
echo ""
echo "⚙️  Creating Infrastructure tasks..."

create_task \
  "Migrate to Kubernetes for production deployment" \
  "Move from Docker Compose to k8s for better scaling and orchestration." \
  "infrastructure" \
  "done" \
  "high" \
  "feature"

create_task \
  "Set up CI/CD pipeline with GitHub Actions" \
  "Automate testing, building, and deployment for all projects." \
  "infrastructure" \
  "done" \
  "high" \
  "feature"

create_task \
  "Implement comprehensive monitoring and alerting" \
  "Deploy Prometheus, Grafana, and PagerDuty for full observability." \
  "infrastructure" \
  "in-progress" \
  "high" \
  "feature"

create_task \
  "Audit security vulnerabilities across all services" \
  "Run Snyk, Trivy, and manual penetration testing. Remediate all high/critical findings." \
  "infrastructure" \
  "todo" \
  "high" \
  "research"

create_task \
  "Optimize database query performance" \
  "Several slow queries identified in production. Add indexes and optimize N+1 queries." \
  "infrastructure" \
  "todo" \
  "medium" \
  "bug"

echo ""
echo "✅ Task seeding complete!"
echo ""
echo "📋 Summary:"
echo "   • BrainMeld: 6 tasks"
echo "   • DealMeld: 5 tasks"
echo "   • MessageMeld: 4 tasks"
echo "   • Infrastructure: 5 tasks"
echo "   • Total: 20 tasks"
echo ""
