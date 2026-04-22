import { createClient } from '@supabase/supabase-js';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

export const testSupabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

export const mockSingle = jest.fn();
export const mockSelect = jest.fn(() => ({ single: mockSingle }));
export const mockInsert = jest.fn(() => ({ select: mockSelect }));
export const mockEq = jest.fn().mockResolvedValue({ error: null });
export const mockDelete = jest.fn(() => ({ eq: mockEq }));

export const mockSupabaseFrom = jest.fn((_table: string) => ({
  insert: mockInsert,
  delete: mockDelete
}));

export function setupSupabaseUnitTestLifecycle(): void {
  beforeEach(async () => {
    await seedSupabaseTestData();
  });

  afterEach(async () => {
    await cleanupSupabaseTestData();
  });
}

export async function seedSupabaseTestData(): Promise<void> {
  mockSingle.mockResolvedValue({
    data: { need_id: 'test-need-id' },
    error: null
  });
}

export async function cleanupSupabaseTestData(): Promise<void> {
  // Pattern for local integration tests: clear tables touched by test data.
  for (const table of ['match_logs', 'needs', 'volunteers']) {
    await mockSupabaseFrom(table).delete().eq('ngo_id', 'ngo_default_01');
  }

  mockEq.mockClear();
  mockDelete.mockClear();
  mockInsert.mockClear();
  mockSelect.mockClear();
  mockSingle.mockClear();
  mockSupabaseFrom.mockClear();
}