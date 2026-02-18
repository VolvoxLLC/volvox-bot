#!/usr/bin/env python3
"""Mercury Bank CLI - Check balances, transactions, and account info."""

import requests
import json
import sys
import os
from datetime import datetime, timedelta

API_TOKEN = os.environ.get('MERCURY_TOKEN', 'secret-token:mercury_production_rma_GQPXDVkYQGWSJKLfCZPd2Vot9iMRYaD9WuRhtwVXFUHuq_yrucrem')
BASE_URL = 'https://api.mercury.com/api/v1'

def api(endpoint, method='GET', params=None):
    """Make Mercury API call."""
    url = f'{BASE_URL}{endpoint}'
    r = requests.get(url, auth=(API_TOKEN, ''), params=params)
    r.raise_for_status()
    return r.json()

def format_money(cents):
    """Format cents as dollars."""
    if cents is None:
        return '$0.00'
    return f'${cents/100:,.2f}'

def cmd_accounts():
    """List all accounts with balances."""
    data = api('/accounts')
    accounts = data.get('accounts', [])
    
    total = 0
    print("💰 Mercury Accounts\n")
    for acc in accounts:
        name = acc.get('name', 'Unknown')
        balance = acc.get('currentBalance', 0)
        available = acc.get('availableBalance', 0)
        acc_type = acc.get('type', 'checking')
        acc_id = acc.get('id', '')
        
        total += balance
        print(f"  {name} ({acc_type})")
        print(f"    Balance:   {format_money(balance)}")
        print(f"    Available: {format_money(available)}")
        print(f"    ID: {acc_id[:8]}...")
        print()
    
    print(f"📊 Total: {format_money(total)}")
    return accounts

def cmd_transactions(account_id=None, limit=10):
    """Get recent transactions."""
    if not account_id:
        accounts = api('/accounts').get('accounts', [])
        if not accounts:
            print("No accounts found!")
            return
        account_id = accounts[0]['id']
    
    data = api(f'/account/{account_id}/transactions', params={'limit': limit})
    transactions = data.get('transactions', [])
    
    print(f"📜 Recent Transactions (last {limit})\n")
    for tx in transactions:
        date = tx.get('postedAt', tx.get('createdAt', ''))[:10]
        desc = tx.get('bankDescription') or tx.get('externalMemo') or tx.get('note') or 'No description'
        amount = tx.get('amount', 0)
        status = tx.get('status', '')
        
        # Truncate description
        if len(desc) > 40:
            desc = desc[:37] + '...'
        
        sign = '+' if amount > 0 else ''
        print(f"  {date}  {sign}{format_money(amount):>12}  {desc}")
    
    return transactions

def cmd_summary():
    """Account summary with recent activity."""
    accounts = api('/accounts').get('accounts', [])
    
    total_balance = 0
    print("💰 Mercury Summary\n")
    print("=" * 50)
    
    for acc in accounts:
        name = acc.get('name', 'Unknown')
        balance = acc.get('currentBalance', 0)
        total_balance += balance
        print(f"  {name}: {format_money(balance)}")
    
    print("=" * 50)
    print(f"  TOTAL: {format_money(total_balance)}")
    print()
    
    # Get recent transactions from first account
    if accounts:
        print("📜 Last 5 Transactions:")
        data = api(f'/account/{accounts[0]["id"]}/transactions', params={'limit': 5})
        for tx in data.get('transactions', []):
            date_str = tx.get('postedAt') or tx.get('createdAt') or ''
            date = date_str[:10] if date_str else 'Pending'
            desc = tx.get('bankDescription') or tx.get('externalMemo') or 'No description'
            amount = tx.get('amount', 0)
            if len(desc) > 35:
                desc = desc[:32] + '...'
            sign = '+' if amount > 0 else ''
            print(f"    {date}  {sign}{format_money(amount):>10}  {desc}")

def cmd_raw():
    """Get raw accounts JSON."""
    data = api('/accounts')
    print(json.dumps(data, indent=2))

COMMANDS = {
    'accounts': (cmd_accounts, "List all accounts with balances"),
    'transactions': (cmd_transactions, "Show recent transactions"),
    'summary': (cmd_summary, "Account summary with recent activity"),
    'raw': (cmd_raw, "Raw JSON output"),
}

def main():
    if len(sys.argv) < 2:
        print("Usage: mercury.py <command>")
        print("\nCommands:")
        for name, (_, desc) in COMMANDS.items():
            print(f"  {name:15} - {desc}")
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd not in COMMANDS:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
    
    func, _ = COMMANDS[cmd]
    func()

if __name__ == '__main__':
    main()
