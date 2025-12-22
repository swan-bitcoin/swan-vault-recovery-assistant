#!/bin/bash

# exit on any command failure unless --continue-on-error is specified
CONTINUE_ON_ERROR=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --continue-on-error)
            CONTINUE_ON_ERROR=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--continue-on-error]"
            exit 1
            ;;
    esac
done

run_command() {
    local cmd="$1"
    local file="$2"
    local description="$3"
    
    echo "Running: $cmd $file"
    
    if $cmd "$file"; then
        return 0
    else
        local exit_code=$?
        if [ "$CONTINUE_ON_ERROR" = true ]; then
            echo "Warning: $description failed for $file"
            return 0
        else
            echo "Error: $description failed for $file"
            exit $exit_code
        fi
    fi
}

files=$(ls swan-vault-recovery-assistant*.{rpm,dmg,AppImage,deb,msi,exe} 2>/dev/null)

if [ -z "$files" ]; then
    echo "No matching files found."
    exit 1
fi

for file in $files; do
    echo "Processing file: $file"
    
    run_command "gh attestation verify --repo swan-bitcoin/swan-vault-recovery-assistant" "$file" "attestation verify"
    run_command "gh release verify-asset --repo swan-bitcoin/swan-vault-recovery-assistant" "$file" "release verify-asset"
    
    echo "----------------------------------------"
done

echo "All files processed."
