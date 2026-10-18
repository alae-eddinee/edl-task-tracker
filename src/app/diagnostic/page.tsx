'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function DiagnosticPage() {
  const [results, setResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(msg);
      setResults([...logs]);
    };

    log('=== LOGIN DIAGNOSTICS ===');
    log(`Time: ${new Date().toLocaleString()}`);
    log(`Browser: ${navigator.userAgent}`);
    log(`Cookies enabled: ${navigator.cookieEnabled}`);
    log(`Online: ${navigator.onLine}`);
    log('');

    // Test 1: Check if we can reach Supabase
    log('TEST 1: Checking Supabase connectivity...');
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        log(`❌ FAILED: ${error.message}`);
        log(`   Code: ${error.code || 'N/A'}`);
      } else {
        log(`✅ SUCCESS: Connected to Supabase`);
        log(`   Session: ${data.session ? 'Active' : 'None'}`);
      }
    } catch (err: any) {
      log(`❌ EXCEPTION: ${err?.message || String(err)}`);
      log(`   This means the browser cannot reach Supabase at all`);
    }
    log('');

    // Test 2: Check localStorage
    log('TEST 2: Checking localStorage...');
    try {
      const testKey = 'diag_test';
      localStorage.setItem(testKey, 'test');
      const value = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      if (value === 'test') {
        log('✅ SUCCESS: localStorage working');
      } else {
        log('❌ FAILED: localStorage not working properly');
      }
    } catch (err: any) {
      log(`❌ FAILED: ${err?.message}`);
    }
    log('');

    // Test 3: Check existing auth data
    log('TEST 3: Checking stored auth data...');
    try {
      const keys = Object.keys(localStorage).filter(k => 
        k.includes('supabase') || k.includes('sb-')
      );
      log(`   Found ${keys.length} Supabase-related keys`);
      keys.forEach(k => log(`   - ${k}`));
      if (keys.length === 0) {
        log('   No stored auth data found');
      }
    } catch (err: any) {
      log(`❌ ERROR: ${err?.message}`);
    }
    log('');

    // Test 4: Network check
    log('TEST 4: Checking network...');
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
        method: 'HEAD',
        mode: 'no-cors',
      });
      log('✅ SUCCESS: Can reach Supabase servers');
    } catch (err: any) {
      log(`❌ FAILED: Cannot reach Supabase servers`);
      log(`   Error: ${err?.message || 'Network blocked'}`);
      log(`   Likely causes: Firewall, VPN, antivirus, corporate network`);
    }
    log('');

    log('=== DIAGNOSTICS COMPLETE ===');
    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-[var(--background-secondary)] p-4">
      <div className="max-w-2xl mx-auto">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">Login Diagnostics</h1>
          <p className="text-[var(--foreground-secondary)] mb-6">
            Run this test on the device that cannot log in. It will identify what&apos;s blocking the connection.
          </p>

          <Button 
            onClick={runDiagnostics} 
            loading={isRunning}
            className="mb-6"
          >
            {isRunning ? 'Running tests...' : 'Run Diagnostics'}
          </Button>

          {results.length > 0 && (
            <div className="bg-[var(--background-tertiary)] rounded-lg p-4 font-mono text-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold">Results:</span>
                <button
                  onClick={() => navigator.clipboard.writeText(results.join('\n'))}
                  className="text-xs text-[var(--primary)] hover:underline"
                >
                  Copy to clipboard
                </button>
              </div>
              <pre className="whitespace-pre-wrap break-all text-xs max-h-96 overflow-y-auto">
                {results.join('\n')}
              </pre>
            </div>
          )}

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">Common Issues:</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li><strong>Test 1 fails:</strong> JavaScript blocked or Supabase API unreachable</li>
              <li><strong>Test 2 fails:</strong> Private browsing mode or storage disabled</li>
              <li><strong>Test 4 fails:</strong> Firewall/VPN/antivirus blocking the connection</li>
            </ul>
          </div>

          <div className="mt-4 text-center">
            <a href="/login" className="text-[var(--primary)] hover:underline">
              Back to Login
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
