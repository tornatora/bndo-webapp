-- Run this in Supabase SQL Editor after you create/login the admin user once.
-- Replace the email below with your real admin email.

update public.profiles
set role = 'ops_admin'
where email = 'admin@yourdomain.com';

select id, email, role
from public.profiles
where email = 'admin@yourdomain.com';
