#!/usr/bin/env python3
"""Extract tracking numbers from text using common carrier patterns."""

import re
import sys
import json

# Carrier patterns (regex, carrier name, 17track carrier code if known)
PATTERNS = [
    # USPS
    (r'\b(9[234]\d{20,22})\b', 'USPS', 21),
    (r'\b(82\d{8})\b', 'USPS', 21),
    (r'\b([A-Z]{2}\d{9}US)\b', 'USPS International', 21),
    
    # UPS
    (r'\b(1Z[A-Z0-9]{16})\b', 'UPS', 100),
    (r'\b(T\d{10})\b', 'UPS Freight', 100),
    
    # FedEx
    (r'\b(\d{12,15})\b', 'FedEx', 100003),  # Generic - needs validation
    (r'\b(\d{20,22})\b', 'FedEx', 100003),
    
    # DHL
    (r'\b(\d{10,11})\b', 'DHL', 100001),  # Generic
    (r'\b([0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{2})\b', 'DHL Express', 100001),
    
    # Amazon
    (r'\b(TBA\d{12,15})\b', 'Amazon Logistics', 190271),
    
    # China Post / AliExpress
    (r'\b([A-Z]{2}\d{9}CN)\b', 'China Post', 3011),
    (r'\b(LP\d{14,16})\b', 'Cainiao/AliExpress', 190008),
    (r'\b(YANWEN[A-Z0-9]{10,20})\b', 'Yanwen', 190011),
    
    # OnTrac
    (r'\b(C\d{14})\b', 'OnTrac', 100049),
    (r'\b(D\d{14})\b', 'OnTrac', 100049),
    
    # LaserShip
    (r'\b(1LS\d{12})\b', 'LaserShip', 100108),
    (r'\b(LX\d{10,15})\b', 'LaserShip', 100108),
]

def extract_tracking_numbers(text):
    """Extract potential tracking numbers from text."""
    results = []
    seen = set()
    
    for pattern, carrier, code in PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            tracking = match.upper() if isinstance(match, str) else match[0].upper()
            if tracking not in seen and len(tracking) >= 8:
                seen.add(tracking)
                results.append({
                    'tracking': tracking,
                    'carrier': carrier,
                    'carrier_code': code
                })
    
    return results

def main():
    if len(sys.argv) > 1:
        text = ' '.join(sys.argv[1:])
    else:
        text = sys.stdin.read()
    
    results = extract_tracking_numbers(text)
    
    if results:
        print(json.dumps(results, indent=2))
    else:
        print("[]")

if __name__ == '__main__':
    main()
