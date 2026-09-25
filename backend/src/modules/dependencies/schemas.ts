import { z } from 'zod';

export const dependencyParamSchema = z.object({
  taskId: z.string().uuid('Invalid task id.'),
  dependsOnTaskId: z.string().uuid('Invalid dependency id.'),
});

export const createDependencySchema = z
  .object({ dependsOnTaskId: z.string().uuid('Choose a task to depend on.') })
  .strict();

export type CreateDependencyInput = z.infer<typeof createDependencySchema>;
