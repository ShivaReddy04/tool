import { z } from 'zod';
import { uuid } from './common';

// tableId can be a UUID (saved table_definition.id) or the physical composite
// key "connId::db::schema::table" the developer dashboard sends for tables
// that haven't been promoted to DART yet.
const compositeKey = z.string().regex(/^[^:]+::[^:]+::[^:]+::[^:]+$/, 'must be a UUID or conn::db::schema::table');
export const submitForReviewBody = z.object({
  tableId: z.union([uuid, compositeKey]),
  assignedArchitectId: uuid,
});

export const reviewSubmissionBody = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export type SubmitForReviewInput = z.infer<typeof submitForReviewBody>;
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionBody>;
