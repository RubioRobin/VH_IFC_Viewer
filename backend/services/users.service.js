const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

module.exports = (supabase) => {
    return {
        async getUserByUsername(username) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('users').select('*').eq('username', username).single();
            if (error) return null;
            return data;
        },

        async getUserById(id) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
            if (error) return null;
            return data;
        },

        async getAllUsers() {
            if (!supabase) return [];
            const { data, error } = await supabase
                .from('users')
                .select('id, username, role, created_at')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('getAllUsers error:', error);
                return [];
            }
            return data || [];
        },

        async createUser(username, password, role = 'user') {
            if (!supabase) throw new Error('Database not initialized');
            const hashedPassword = await bcrypt.hash(password, 10);
            const { data, error } = await supabase
                .from('users')
                .insert([{ id: uuidv4(), username, password_hash: hashedPassword, role }])
                .select('id, username, role, created_at')
                .single();

            if (error) {
                console.error('createUser error:', error);
                throw new Error(error.message || 'Aanmaken gebruiker mislukt');
            }
            return data;
        },

        async updateUserProfile(id, { username, email, password, avatar_url, role, disabled }) {
            if (!supabase) throw new Error('Database not initialized');
            const updates = {};
            if (username) updates.username = username;
            if (email !== undefined) updates.email = email;
            if (avatar_url !== undefined) updates.avatar_url = avatar_url;
            if (role) updates.role = role;
            if (typeof disabled === 'boolean') updates.disabled = disabled;
            if (password) {
                updates.password_hash = await bcrypt.hash(password, 10);
            }

            if (Object.keys(updates).length === 0) return null;

            const { data, error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', id)
                .select('id, username, email, avatar_url, role, disabled')
                .single();

            if (error) throw error;
            return data;
        },

        async deleteUser(id) {
            if (!supabase) return;
            const { error } = await supabase.from('users').delete().eq('id', id);
            if (error) throw error;
        }
    };
};
