import { Injectable, Dependencies } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { APP_CONFIG } from '../common/tokens';

const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  // Node < 22 has no native WebSocket; realtime is unused but supabase-js still constructs it.
  realtime: { transport: ws },
};

@Injectable()
@Dependencies(APP_CONFIG)
export class SupabaseService {
  constructor(config) {
    this.config = config;
    // Service-role client: bypasses RLS. Server-side only.
    this.admin = createClient(config.supabase.url, config.supabase.serviceRoleKey, CLIENT_OPTIONS);
  }

  /** A fresh anon client per auth call, so user sessions never leak between requests. */
  anon() {
    return createClient(this.config.supabase.url, this.config.supabase.anonKey, CLIENT_OPTIONS);
  }
}
