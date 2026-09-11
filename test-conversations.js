// Test script: authenticate and test all conversation endpoints
// Run with: node test-conversations.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pmwwaorjzxwuagjvtkkn.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtd3dhb3Jqenh3dWFnanZ0a2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzQ1MTUsImV4cCI6MjA4NzI1MDUxNX0.e2-Wz69WYLW7U9TSOHqhZxvqHMdyNhnYdw86Lomsimg';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtd3dhb3Jqenh3dWFnanZ0a2tuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3NDUxNSwiZXhwIjoyMDg3MjUwNTE1fQ.L5pVoA0Fps3h98VigoVnXm0RzNPn9u-Rk6hht9Qgdcw';

async function main() {
  // Create admin client to generate a magic link
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Generate a magic link for the user
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'nfdrepairs@gmail.com',
  });

  if (error) {
    console.log('Failed to generate link:', error.message);
    return;
  }

  console.log('Generated magic link for:', data.user.email);

  // Extract the token from the action_link
  const actionLink = data.properties?.action_link || '';
  const url = new URL(actionLink);
  const token = url.searchParams.get('token');
  console.log('Token:', token?.substring(0, 20) + '...');

  // Create a client to verify the token and get a session
  const userClient = createClient(SUPABASE_URL, ANON_KEY);

  // Use the OTP verification
  const { data: verifyData, error: verifyError } = await userClient.auth.verifyOtp({
    token_hash: token,
    type: 'magiclink',
  });

  if (verifyError) {
    console.log('Verify failed:', verifyError.message);
    // Try with email OTP instead
    console.log('Trying alternative approach...');
    return;
  }

  console.log('Session obtained!');
  console.log('Access token:', verifyData.session?.access_token?.substring(0, 30) + '...');
  console.log('User:', verifyData.user?.email);

  // Now test the API endpoints with the session
  const session = verifyData.session;
  const authHeader = `Bearer ${session.access_token}`;

  // Test 1: GET /api/conversations
  console.log('\n=== Test 1: GET /api/conversations ===');
  const r1 = await fetch('http://localhost:3000/api/conversations?limit=5', {
    headers: { Authorization: authHeader },
  });
  const d1 = await r1.json();
  console.log(`Status: ${r1.status}`);
  console.log(`Success: ${d1.success}`);
  console.log(`Messages returned: ${d1.messages?.length || 0}`);
  if (d1.messages?.length > 0) {
    console.log(`First message: direction=${d1.messages[0].direction} channel=${d1.messages[0].channel} phone=${d1.messages[0].phone}`);
  }

  // Test 2: GET /api/conversations/inbox
  console.log('\n=== Test 2: GET /api/conversations/inbox ===');
  const r2 = await fetch('http://localhost:3000/api/conversations/inbox?limit=10', {
    headers: { Authorization: authHeader },
  });
  const d2 = await r2.json();
  console.log(`Status: ${r2.status}`);
  console.log(`Success: ${d2.success}`);
  console.log(`Total unread: ${d2.total_unread}`);
  console.log(`Conversations: ${d2.conversations?.length || 0}`);
  if (d2.conversations?.length > 0) {
    for (const c of d2.conversations.slice(0, 3)) {
      console.log(`  ${c.phone} → ${c.customer_name || '?'} (unread=${c.unread_count}, msgs=${c.message_count})`);
    }
  }

  // Test 3: GET /api/conversations/search
  console.log('\n=== Test 3: GET /api/conversations/search?q=screen ===');
  const r3 = await fetch('http://localhost:3000/api/conversations/search?q=screen', {
    headers: { Authorization: authHeader },
  });
  const d3 = await r3.json();
  console.log(`Status: ${r3.status}`);
  console.log(`Success: ${d3.success}`);
  console.log(`Results: ${d3.results?.length || 0}`);
  console.log(`Total matches: ${d3.total_matches}`);
  if (d3.results?.length > 0) {
    console.log(`Top result: phone=${d3.results[0].phone} name=${d3.results[0].customer_name || '?'} matches=${d3.results[0].match_count}`);
  }

  // Test 4: GET /api/conversations with phone filter
  console.log('\n=== Test 4: GET /api/conversations?phone=07956235774 ===');
  const r4 = await fetch('http://localhost:3000/api/conversations?phone=07956235774&limit=10', {
    headers: { Authorization: authHeader },
  });
  const d4 = await r4.json();
  console.log(`Status: ${r4.status}`);
  console.log(`Messages: ${d4.messages?.length || 0}`);
  if (d4.messages?.length > 0) {
    for (const m of d4.messages.slice(0, 3)) {
      console.log(`  ${m.direction} ${m.channel} ${m.created_at?.substring(0,19)} ${(m.message || '').substring(0, 50)}`);
    }
  }

  // Test 5: GET /api/conversations/inbox with unread_only
  console.log('\n=== Test 5: GET /api/conversations/inbox?unread_only=1 ===');
  const r5 = await fetch('http://localhost:3000/api/conversations/inbox?unread_only=1&limit=10', {
    headers: { Authorization: authHeader },
  });
  const d5 = await r5.json();
  console.log(`Status: ${r5.status}`);
  console.log(`Unread conversations: ${d5.conversations?.length || 0}`);
  console.log(`Total unread: ${d5.total_unread}`);

  // Test 6: GET /api/conversations with job_id filter
  console.log('\n=== Test 6: GET /api/conversations with job_id ===');
  // First get a job ID from the inbox
  const jobId = d2.conversations?.find(c => c.job_id)?.job_id;
  if (jobId) {
    const r6 = await fetch(`http://localhost:3000/api/conversations?job_id=${jobId}&limit=5`, {
      headers: { Authorization: authHeader },
    });
    const d6 = await r6.json();
    console.log(`Status: ${r6.status}`);
    console.log(`Messages for job: ${d6.messages?.length || 0}`);
    if (d6.messages?.length > 0) {
      console.log(`First: ${d6.messages[0].direction} ${d6.messages[0].channel} ${(d6.messages[0].message || '').substring(0, 50)}`);
    }
  } else {
    console.log('No job_id found in inbox');
  }

  console.log('\n=== All API tests complete ===');
}

main().catch(console.error);
