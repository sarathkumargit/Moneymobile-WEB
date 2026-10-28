-- Store both sides of the ID card for customers and guarantors.
alter table customers  add column if not exists nic_doc_back_url text;
alter table guarantors add column if not exists nic_doc_back_url text;
