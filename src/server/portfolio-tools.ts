import { createClient } from '@supabase/supabase-js';
import { defineTool, type ToolDefinition } from '@copilotkit/runtime/v2';
import { z } from 'zod';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tcfvetlrghiivarkxswr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZnZldGxyZ2hpaXZhcmt4c3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NTMzMjIsImV4cCI6MjA4NDAyOTMyMn0.kUr-ypwl6knujjoZeTHEOHKYdLsvFhSv1gQRKQQccdc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function portfolioTools(): ToolDefinition[] {
  return [
    defineTool({
      name: 'get_ca_inter_curriculum',
      description: 'Fetch CA Intermediate syllabus, papers, chapters, and topics from the user portfolio database.',
      parameters: z.object({
        paperNumber: z.number().int().min(1).max(6).optional().describe('Paper number 1 to 6 (e.g. 2 for Corporate & Other Laws)'),
        searchQuery: z.string().optional().describe('Optional topic or chapter name to search for')
      }),
      execute: async ({ paperNumber, searchQuery }) => {
        try {
          let paperQuery = supabase.from('ca_papers').select('*');
          if (paperNumber) {
            paperQuery = paperQuery.eq('paper_number', paperNumber);
          }
          const { data: papers, error: pErr } = await paperQuery;
          if (pErr) return { error: pErr.message };

          const results = [];
          for (const paper of papers || []) {
            let chQuery = supabase.from('ca_chapters').select('id, name, order_index').eq('paper_id', paper.id).order('order_index');
            if (searchQuery) {
              chQuery = chQuery.ilike('name', `%${searchQuery}%`);
            }
            const { data: chapters } = await chQuery;
            results.push({
              paper: `${paper.code} (Paper ${paper.paper_number}): ${paper.name}`,
              group: paper.group_num,
              chapters: chapters || []
            });
          }
          return { success: true, count: results.length, data: results };
        } catch (err: any) {
          return { error: err.message || 'Failed to fetch curriculum' };
        }
      }
    }),

    defineTool({
      name: 'log_ca_study_session',
      description: 'Log a completed CA Intermediate study session into the user portfolio tracking database.',
      parameters: z.object({
        paperName: z.string().describe('Subject or Paper name (e.g., Corporate Law, Taxation, Accounts)'),
        chapterName: z.string().describe('Chapter or topic studied (e.g. Acceptance of Deposits, Dividend)'),
        durationMinutes: z.number().int().min(1).describe('Study duration in minutes (e.g. 90, 210)'),
        notes: z.string().describe('Key takeaways, formulas, or questions practiced during this session')
      }),
      execute: async ({ paperName, chapterName, durationMinutes, notes }) => {
        try {
          const { data, error } = await supabase.from('ca_study_sessions').insert([
            {
              subject: paperName,
              chapter: chapterName,
              duration_minutes: durationMinutes,
              notes,
              study_date: new Date().toISOString().slice(0, 10)
            }
          ]).select();

          if (error) {
            // If table schema differs, fall back to logging in daily reflections
            await supabase.from('daily_reflections').insert([
              {
                reflection: `[CA Study] ${paperName} - ${chapterName} (${durationMinutes} mins): ${notes}`,
                date: new Date().toISOString().slice(0, 10)
              }
            ]);
            return { success: true, message: 'Logged in daily study log' };
          }
          return { success: true, session: data?.[0] };
        } catch (err: any) {
          return { error: err.message || 'Failed to log study session' };
        }
      }
    }),

    defineTool({
      name: 'save_ca_mock_evaluation',
      description: 'Save ICAI mock test evaluation scores and detailed rubric feedback into the portfolio database.',
      parameters: z.object({
        paperCode: z.string().describe('Paper code (e.g. COL for Law, TAX, AA)'),
        questionDescription: z.string().describe('Question number and topic evaluated'),
        marksAwarded: z.number().describe('Marks awarded (e.g. 7.5)'),
        totalMarks: z.number().describe('Maximum marks for question (e.g. 10)'),
        feedback: z.string().describe('ICAI style evaluation feedback, key provisions missed, presentation tips')
      }),
      execute: async ({ paperCode, questionDescription, marksAwarded, totalMarks, feedback }) => {
        try {
          const { data, error } = await supabase.from('ca_test_attempts').insert([
            {
              paper_code: paperCode,
              topic: questionDescription,
              marks_obtained: marksAwarded,
              total_marks: totalMarks,
              feedback,
              attempt_date: new Date().toISOString().slice(0, 10)
            }
          ]).select();

          if (error) {
            // Also save to daily learning logs
            await supabase.from('learning_logs').insert([
              {
                title: `CA Evaluation: ${paperCode} - ${questionDescription}`,
                content: `Score: ${marksAwarded}/${totalMarks}\nFeedback:\n${feedback}`,
                category: 'CA Intermediate'
              }
            ]);
            return { success: true, loggedIn: 'learning_logs', score: `${marksAwarded}/${totalMarks}` };
          }
          return { success: true, attempt: data?.[0] };
        } catch (err: any) {
          return { error: err.message };
        }
      }
    }),

    defineTool({
      name: 'get_portfolio_habits_and_tasks',
      description: 'Fetch the user daily tasks, active habits, and streak metrics from the portfolio database.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const [tasksRes, habitsRes, streakRes] = await Promise.all([
            supabase.from('daily_tasks').select('*').limit(20),
            supabase.from('habits').select('*').limit(20),
            supabase.from('streaks').select('*').limit(5)
          ]);
          return {
            success: true,
            tasks: tasksRes.data || [],
            habits: habitsRes.data || [],
            streaks: streakRes.data || []
          };
        } catch (err: any) {
          return { error: err.message };
        }
      }
    }),

    defineTool({
      name: 'create_founder_journal_entry',
      description: 'Record an entry in the user portfolio Journal / Daily Reflection table (for KroTravel founder notes or CA reflections).',
      parameters: z.object({
        title: z.string().describe('Title of the journal entry'),
        content: z.string().describe('Full markdown content of the entry'),
        category: z.enum(['KroTravel', 'CA Inter', 'Personal', 'Mindset']).describe('Category')
      }),
      execute: async ({ title, content, category }) => {
        try {
          const { data, error } = await supabase.from('journal_entries').insert([
            {
              title,
              content,
              category,
              entry_date: new Date().toISOString().slice(0, 10)
            }
          ]).select();

          if (error) {
            // Fallback to learning_logs if journal_entries schema differs
            await supabase.from('learning_logs').insert([
              {
                title,
                content: `[${category}]\n${content}`,
                category
              }
            ]);
            return { success: true, storedIn: 'learning_logs', title };
          }
          return { success: true, entry: data?.[0] };
        } catch (err: any) {
          return { error: err.message };
        }
      }
    })
  ];
}
