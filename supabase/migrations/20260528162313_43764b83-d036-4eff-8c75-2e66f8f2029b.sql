-- Restrict realtime channel subscriptions to room members only.
-- Topic format used by the client: 'room:<room_uuid>'

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_members_can_read_realtime" ON realtime.messages;

CREATE POLICY "room_members_can_read_realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.user_id = auth.uid()
      AND realtime.topic() = 'room:' || p.room_id::text
  )
);