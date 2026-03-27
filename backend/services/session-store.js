/**
 * Supabase-backed Express session store.
 * Slaat sessies op in de `sessions` tabel zodat ze een herstart van de backend overleven.
 * Geen extra npm-pakket nodig — gebruikt de bestaande Supabase client.
 */
const session = require('express-session');

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Verwijder verlopen sessies elke 15 min

module.exports = function createSupabaseSessionStore(supabase) {
    class SupabaseStore extends session.Store {
        constructor() {
            super();
            // Periodiek verlopen sessies verwijderen
            this._cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
            if (this._cleanupTimer.unref) this._cleanupTimer.unref(); // Houd Node.js process niet wakker
        }

        async get(sid, callback) {
            try {
                const { data, error } = await supabase
                    .from('sessions')
                    .select('sess, expire')
                    .eq('sid', sid)
                    .gt('expire', new Date().toISOString())
                    .maybeSingle();

                if (error) return callback(error);
                callback(null, data ? data.sess : null);
            } catch (e) {
                callback(e);
            }
        }

        async set(sid, sess, callback) {
            try {
                const maxAge = sess.cookie?.maxAge || 24 * 60 * 60 * 1000;
                const expire = new Date(Date.now() + maxAge).toISOString();

                const { error } = await supabase
                    .from('sessions')
                    .upsert({ sid, sess, expire }, { onConflict: 'sid' });

                if (error) return callback(error);
                callback(null);
            } catch (e) {
                callback(e);
            }
        }

        async destroy(sid, callback) {
            try {
                const { error } = await supabase
                    .from('sessions')
                    .delete()
                    .eq('sid', sid);

                if (error) return callback(error);
                callback(null);
            } catch (e) {
                callback(e);
            }
        }

        // Express-session roept touch() aan om expiry bij te werken zonder sessie te verversen
        touch(sid, sess, callback) {
            this.set(sid, sess, callback);
        }

        async _cleanup() {
            try {
                await supabase
                    .from('sessions')
                    .delete()
                    .lt('expire', new Date().toISOString());
            } catch (e) {
                // Stil falen — cleanup is niet kritiek
            }
        }
    }

    return new SupabaseStore();
};
