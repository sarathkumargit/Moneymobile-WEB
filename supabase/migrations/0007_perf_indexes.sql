-- Indexes for hot query paths used by the dashboard, customer page and device heartbeat.
-- All are additive and safe to run on an existing database.

-- device_enrollments is looked up by device_id on nearly every device action
create index if not exists idx_enrollments_device on device_enrollments(device_id);
create index if not exists idx_enrollments_token on device_enrollments(enroll_token_hash);

-- payments and agreements are filtered by customer/device on the customer page
create index if not exists idx_payments_customer on payment_transactions(customer_id);
create index if not exists idx_agreements_device on installment_agreements(device_id);

-- security events are fetched by enrollment on the customer page
create index if not exists idx_security_events_enrollment on device_security_events(enrollment_id);

-- the heartbeat picks the newest pending command for an enrollment
create index if not exists idx_commands_enrollment_status on device_commands(enrollment_id, status, created_at desc);

-- unlock requests dedupe/list by enrollment
create index if not exists idx_unlock_requests_enrollment on device_unlock_requests(enrollment_id);
