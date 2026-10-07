SET LOCAL app.academy_progress_trusted_write = 'on';
UPDATE public.academy_progress
SET passed_at = COALESCE(passed_at, now()),
    passed_score = COALESCE(passed_score, 15),
    current_module_index = GREATEST(current_module_index, 30)
WHERE user_id = '7a0e03f6-6614-4f47-830a-5ed454e4979d';