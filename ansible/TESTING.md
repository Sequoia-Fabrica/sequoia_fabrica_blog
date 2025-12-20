# Testing the Ansible Playbook

This guide covers various ways to test the `sol.yml` playbook before deploying to production.

## Prerequisites

1. **Install Ansible** (if not already installed):
   ```bash
   # macOS
   brew install ansible
   
   # Or via pip
   pip install ansible
   ```

2. **Install required Ansible collections**:
   ```bash
   cd ansible
   ansible-galaxy collection install -r collections/requirements.yml
   ```

3. **Create/verify inventory file**:
   Create `ansible/inventory.ini` with your target host:
   ```ini
   sol ansible_host=sol.local ansible_user=root
   ```

   **Important**: Use `sol.local` (mDNS) for initial connection. The system will only be available at `sol.cloudforest-perch.ts.net` *after* Tailscale is configured by the playbook. After the first successful run, you can optionally update the inventory to use the Tailscale hostname.

4. **Ensure vault file is set up**:
   ```bash
   # Decrypt and edit vault (if needed)
   ansible-vault edit group_vars/sol/vault.yml
   ```

## Testing Methods

### 1. Syntax Check (Safest - No Changes)

Check for YAML syntax errors and basic validation:

```bash
cd ansible
ansible-playbook --syntax-check sol.yml
```

**Note**: You may see warnings about "No inventory was parsed" - this is normal for syntax checking and can be ignored. To suppress warnings, use:

```bash
# Option 1: Use localhost as inventory
ansible-playbook --syntax-check --inventory localhost, sol.yml

# Option 2: Use a minimal inventory file
ansible-playbook --syntax-check -i inventory.ini sol.yml
```

### 2. Dry Run (Check Mode)

Simulate what would happen without making changes:

```bash
ansible-playbook --check sol.yml -i inventory.ini
```

**Note**: Some tasks (like service restarts) may still run even in check mode. Use with caution.

### 3. Test Specific Tags

Test individual components without running the entire playbook:

```bash
# Test only collectors setup
ansible-playbook --check --tags collectors sol.yml -i inventory.ini

# Test only NGINX setup
ansible-playbook --check --tags nginx sol.yml -i inventory.ini

# Test only base packages
ansible-playbook --check --tags base sol.yml -i inventory.ini
```

### 4. Show Differences (--diff)

See what files would change:

```bash
ansible-playbook --check --diff sol.yml -i inventory.ini
```

### 5. Verbose Output

Get detailed information about what Ansible is doing:

```bash
# Level 1 (minimal)
ansible-playbook -v sol.yml -i inventory.ini

# Level 2 (more detail)
ansible-playbook -vv sol.yml -i inventory.ini

# Level 3 (even more detail)
ansible-playbook -vvv sol.yml -i inventory.ini

# Level 4 (connection debugging)
ansible-playbook -vvvv sol.yml -i inventory.ini
```

### 6. Test Connection First

Verify you can connect to the target host:

```bash
ansible sol -i inventory.ini -m ping
```

**Note**: If using `sol.local`, ensure mDNS/Bonjour is working on your system. On macOS, this should work out of the box. If connection fails, try:
- Using the IP address directly: `ansible_host=192.168.x.x`
- Ensuring you're on the same network as the Raspberry Pi
- Checking that Avahi/mDNS is running on the Pi (it should be after first deployment)

### 7. Limit to Specific Host

If you have multiple hosts, test on one:

```bash
ansible-playbook --limit sol --check sol.yml -i inventory.ini
```

### 8. Step-by-Step Execution

Run tasks one at a time, pausing for confirmation:

```bash
ansible-playbook --step sol.yml -i inventory.ini
```

## Recommended Testing Workflow

### Initial Testing (Before First Deployment)

1. **Syntax check**:
   ```bash
   ansible-playbook --syntax-check sol.yml
   ```

2. **Test connection**:
   ```bash
   ansible sol -i inventory.ini -m ping
   ```

3. **Dry run with diff**:
   ```bash
   ansible-playbook --check --diff sol.yml -i inventory.ini
   ```

4. **Test specific sections** (incrementally):
   ```bash
   # Start with base setup
   ansible-playbook --tags base,user,ssh sol.yml -i inventory.ini
   
   # Then test NGINX
   ansible-playbook --tags nginx sol.yml -i inventory.ini
   
   # Then test collectors
   ansible-playbook --tags collectors sol.yml -i inventory.ini
   ```

### Testing After Changes

1. **Syntax check**:
   ```bash
   ansible-playbook --syntax-check sol.yml
   ```

2. **Dry run on changed section**:
   ```bash
   # If you changed collectors, test only that
   ansible-playbook --check --tags collectors sol.yml -i inventory.ini
   ```

3. **Full dry run**:
   ```bash
   ansible-playbook --check --diff sol.yml -i inventory.ini
   ```

## Common Issues and Solutions

### Issue: "Host not found" or "Could not resolve hostname"
**Solution**: 
- For initial setup, use `sol.local` (mDNS) in your inventory, not the Tailscale hostname
- The Tailscale hostname (`sol.cloudforest-perch.ts.net`) is only available *after* the playbook configures Tailscale
- If `sol.local` doesn't resolve, try using the IP address directly: `ansible_host=192.168.x.x`
- Ensure you're on the same local network as the Raspberry Pi

### Issue: "Permission denied"
**Solution**: Ensure you're using `ansible_user=root` or have sudo access configured.

### Issue: "Vault password required"
**Solution**: Either:
- Use `--ask-vault-pass` flag
- Set `ANSIBLE_VAULT_PASSWORD_FILE` environment variable
- Use `ansible-vault view group_vars/sol/vault.yml` to verify vault is readable

### Issue: "Collection not found"
**Solution**: Install collections:
```bash
ansible-galaxy collection install -r collections/requirements.yml
```

## Production Deployment

Once testing is complete, run the playbook:

```bash
# Full deployment
ansible-playbook sol.yml -i inventory.ini

# Or with vault password prompt
ansible-playbook --ask-vault-pass sol.yml -i inventory.ini
```

## Useful Commands for Verification

After deployment, verify services are running:

```bash
# Check systemd timers
ansible sol -i inventory.ini -m shell -a "systemctl list-timers --all | grep collector"

# Check service status
ansible sol -i inventory.ini -m shell -a "systemctl status power-collector.timer"

# Check if files were created
ansible sol -i inventory.ini -m shell -a "ls -la /opt/sequoia_fabrica_blog/collectors/"
ansible sol -i inventory.ini -m shell -a "ls -la /var/www/html/api/"
```

## Tags Reference

Available tags for selective execution:

- `always` - Always runs (pre-tasks)
- `base` - Base packages and system setup
- `user` - User creation
- `ssh` - SSH configuration
- `nginx` - NGINX web server setup
- `tailscale` - Tailscale VPN setup
- `logging` - Loggly log forwarding
- `sd_wear` - SD card wear minimization
- `motd` - Message of the day
- `avahi` - mDNS setup
- `watchdog` - Hardware watchdog
- `cloudflared` - Cloudflare tunnel (optional)
- `unattended` - Unattended upgrades
- `firewall` - UFW firewall rules
- `time` - Time synchronization
- `metrics` - Prometheus node exporter
- `collectors` - Monitoring collectors setup
- `housekeeping` - Maintenance tasks

