-- One branch manager per branch, optional (nullable), assignable at branch
-- creation or later. A branch manager's own users.branch_id stays NULL --
-- their branch is derived by looking up branches.branch_manager_id = their id.
ALTER TABLE branches ADD COLUMN branch_manager_id UUID REFERENCES users(id);

-- UNIQUE permits multiple NULLs (branches without a manager yet are
-- unaffected) but prevents one user from managing more than one branch.
ALTER TABLE branches ADD CONSTRAINT uq_branches_branch_manager_id UNIQUE (branch_manager_id);
