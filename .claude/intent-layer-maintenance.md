# Intent Layer Maintenance Plan

## Trigger Points

Monitor these areas for changes that require Intent Layer updates:

| Changed Area | Check |
|--------------|-------|
| `collectors/` | Data pipeline docs still accurate? |
| `static/js/powerinfo.js` | Power API contract unchanged? |
| `utils/` | esp-exporter boundary docs need update? |
| `ansible/` | Deployment assumptions still valid? |
| `content/` structure | Frontmatter schema docs current? |

## PR Template Checklist

Add to `.github/pull_request_template.md`:

```markdown
## Intent Layer Check
- [ ] If I changed collectors/, I verified the data pipeline docs
- [ ] If I changed power API, I confirmed format is unchanged
- [ ] If I added new subsystem, I considered updating boundaries
- [ ] If I hit a surprise, I added it to Pitfalls section
```

## Quarterly Review Process

1. **Measure growth**:
   ```bash
   # Check if any directory now exceeds 20k tokens
   estimate_tokens.sh ~/dev/sequoia_fabrica_blog/content
   estimate_tokens.sh ~/dev/sequoia_fabrica_blog/utils
   estimate_tokens.sh ~/dev/sequoia_fabrica_blog/collectors
   estimate_tokens.sh ~/dev/sequoia_fabrica_blog/ansible
   ```

2. **Check for new child node candidates**:
   - Any directory >20k tokens? → Create AGENTS.md
   - New responsibility shift? → Document boundary

3. **Pitfalls audit**:
   - "What confused me in the last 3 months?"
   - "What broke unexpectedly?"
   - Add findings to CLAUDE.md Pitfalls section

4. **Contracts validation**:
   - Power API format still frozen?
   - Frontmatter schema unchanged?
   - Any new implicit contracts emerged?

## Automation Options

### Git Hook (pre-commit)
```bash
#!/bin/bash
# .git/hooks/pre-commit
changed_files=$(git diff --cached --name-only)

if echo "$changed_files" | grep -q "^collectors/"; then
    echo "NOTE: collectors/ changed - verify Intent Layer data pipeline docs"
fi

if echo "$changed_files" | grep -q "powerinfo.js"; then
    echo "NOTE: Power API may have changed - verify contract in CLAUDE.md"
fi
```

### CI Step (GitHub Actions)
```yaml
# .github/workflows/intent-layer-check.yml
name: Intent Layer Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check affected areas
        run: |
          if git diff --name-only origin/main | grep -q "^collectors/"; then
            echo "::warning::collectors/ changed - verify Intent Layer docs"
          fi
```

## Current State

- **Root node**: CLAUDE.md with Intent Layer section
- **Child nodes**: None (all directories <20k tokens)
- **Last audit**: Initial setup
- **Token count**: ~113k total
