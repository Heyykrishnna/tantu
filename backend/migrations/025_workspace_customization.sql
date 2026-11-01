ALTER TABLE tantu.workspaces ADD COLUMN icon text NOT NULL DEFAULT '⚡' CHECK(icon IN ('⚡','🚀','💡','🎯','📚','🏢','🛠️','🌐'));
ALTER TABLE tantu.user_preferences ADD COLUMN accent text NOT NULL DEFAULT 'neutral' CHECK(accent IN ('neutral','indigo','sage'));
ALTER TABLE tantu.user_preferences ADD COLUMN reduce_motion boolean NOT NULL DEFAULT false;
