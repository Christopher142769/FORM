// server/server.js - TOUT LE BACKEND EN UN SEUL FICHIER (FINAL + REDIRECTION)

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const QRCode = require('qrcode');
// 💡 AJOUT : Chargement des variables d'environnement (si vous utilisez .env)
// require('dotenv').config(); 

const app = express();
// Définition des URLs pour la production (basées sur votre environnement Render)
// Remplacer si ces URLs changent!
const BACKEND_URL = 'https://form-backend-pl5d.onrender.com';
const FRONTEND_URL = 'https://startup-form.onrender.com';

// 💡 MODIFIÉ : Utilisation d'un port dynamique (essentiel pour Render)
const PORT = process.env.PORT || 5000; 
// !!! IMPORTANT: À CHANGER PAR UN SECRET COMPLEXE DANS VOS VARS D'ENV !!!
const JWT_SECRET = 'VOTRE_SECRET_TRES_SECURISE_ET_LONG'; 

// --- 1. Middleware de base ---
// Permet à tous les domaines d'accéder (ok pour le développement/test)
app.use(cors());
// Augmenter la limite pour les Data URLs Base64 des logos
app.use(express.json({ limit: '50mb' })); 

// --- 2. Configuration MongoDB ---
// !!! IMPORTANT: À CHANGER PAR VOTRE VRAIE URI MONGODB !!!
const MONGODB_URI = 'mongodb://localhost:27017/formBuilderDB'; 

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connexion à MongoDB réussie !'))
    .catch(err => console.error('Erreur de connexion à MongoDB:', err));

// --- 3. Modèles Mongoose ---

// Schéma pour l'Utilisateur (Entreprise)
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

const User = mongoose.model('User', UserSchema);

// Schéma pour le Formulaire
const FormSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    fields: [{
        label: { type: String, required: true },
        type: { type: String, required: true, enum: ['text', 'textarea', 'email', 'number', 'checkbox'] }
    }],
    logoPath: { type: String, default: '' }, // Contient la Data URL Base64
    urlToken: { type: String, unique: true },
    views: { type: Number, default: 0 },
    submissions: [{
        data: { type: mongoose.Schema.Types.Mixed },
        submittedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

// Générer l'urlToken avant la première sauvegarde
FormSchema.pre('save', async function(next) {
    if (this.isNew && !this.urlToken) {
        // Pour la simplicité, utilisons l'ID de Mongo comme token
        this.urlToken = this._id.toString(); 
    }
    next();
});

const Form = mongoose.model('Form', FormSchema);

// --- 4. Middleware d'Authentification ---
const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentification requise.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.userId; // Stocke l'ID utilisateur dans req.user
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
};

// --- 5. Routes API ---

// A. Authentification
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, companyName } = req.body;
        if (!email || !password || !companyName) {
            return res.status(400).json({ message: 'Tous les champs sont requis.' });
        }
        const user = new User({ email, password, companyName });
        await user.save();
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ token, user: { _id: user._id, email: user.email, companyName: user.companyName } });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Cet email est déjà utilisé.' });
        res.status(500).json({ message: 'Erreur lors de l\'inscription.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
        }
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { _id: user._id, email: user.email, companyName: user.companyName } });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la connexion.' });
    }
});

app.get('/api/auth/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user).select('-password');
        if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Erreur de vérification du token.' });
    }
});

// B. Gestion des Formulaires (Dashboard)
app.post('/api/forms', protect, async (req, res) => {
    try {
        const { _id, title, fields } = req.body;
        let form;
        let isNew = false;
        
        // 1. Mise à jour ou Création
        if (_id) {
            form = await Form.findOne({ _id, userId: req.user });
            if (!form) {
                return res.status(404).json({ message: 'Formulaire non trouvé.' });
            }
            form.title = title;
            form.fields = fields;
        } else {
            isNew = true;
            form = new Form({ userId: req.user, title, fields });
        }
        
        await form.save();

        // 2. Génération du Lien Public
        // 💡 CORRECTION: Le lien doit pointer vers le FRONTEND
        let publicUrl = `${FRONTEND_URL}/form/${form.urlToken}`;
        
        // 3. Génération du QR Code
        const qrCodeDataURL = await QRCode.toDataURL(publicUrl);

        // 4. Réponse
        res.status(isNew ? 201 : 200).json({ 
            form: form, 
            publicUrl, // Renvoie le lien complet
            qrCodeDataURL 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la sauvegarde du formulaire.' });
    }
});

app.get('/api/forms', protect, async (req, res) => {
    try {
        const forms = await Form.find({ userId: req.user }).select('title createdAt submissions');
        res.json(forms.map(form => ({
            _id: form._id,
            title: form.title,
            createdAt: form.createdAt,
            submissions: form.submissions.length
        })));
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des formulaires.' });
    }
});

app.post('/api/forms/:id/logo', protect, async (req, res) => {
    try {
        const form = await Form.findOne({ _id: req.params.id, userId: req.user });
        if (!form) {
            return res.status(404).json({ message: 'Formulaire non trouvé.' });
        }
        
        const { logoData } = req.body;
        if (!logoData || !logoData.startsWith('data:image')) {
            return res.status(400).json({ message: 'Format de données de logo invalide.' });
        }

        form.logoPath = logoData; // Stocke la Data URL Base64
        await form.save();
        
        res.json({ message: 'Logo mis à jour avec succès.', logoPath: form.logoPath });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de l\'upload du logo.' });
    }
});

// C. Routes Publiques (Soumission)
app.get('/api/public/form/:token', async (req, res) => {
    try {
        const form = await Form.findOne({ urlToken: req.params.token }).select('title fields logoPath urlToken');
        if (!form) {
            return res.status(404).json({ message: 'Formulaire non trouvé.' });
        }
        
        // Incrémenter la vue
        form.views += 1;
        await form.save();

        res.json(form);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération du formulaire.' });
    }
});

app.post('/api/public/form/:token/submit', async (req, res) => {
    try {
        const submissionData = req.body;
        const form = await Form.findOne({ urlToken: req.params.token });
        if (!form) {
            return res.status(404).json({ message: 'Formulaire non trouvé.' });
        }

        form.submissions.push({ data: submissionData });
        await form.save();
        res.status(201).json({ message: 'Soumission enregistrée avec succès !' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la soumission.' });
    }
});

// D. Statistiques et Détails (Dashboard)
app.get('/api/forms/:id/stats', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id);
        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        const stats = {
            title: form.title,
            views: form.views,
            submissionCount: form.submissions.length,
            conversionRate: form.views > 0 ? ((form.submissions.length / form.views) * 100).toFixed(2) : 0,
            submissions: form.submissions.map(sub => ({
                data: sub.data,
                submittedAt: sub.submittedAt,
            }))
        };
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération des statistiques.' });
    }
});


// 🚨 CORRECTION CRITIQUE (Route E)
// E. ROUTE DE REDIRECTION PUBLIQUE
// Cette route corrige l'erreur "Cannot GET /form/..."
// Elle intercepte les requêtes sur l'URL de domaine du backend (https://form-backend-pl5d.onrender.com/form/...)
// et redirige immédiatement vers le FRONTEND (https://startup-form.onrender.com/form/...)
app.get('/form/:token', async (req, res) => {
    // Redirection permanente vers l'URL du frontend qui gère le formulaire public
    res.redirect(302, `${FRONTEND_URL}/form/${req.params.token}`);
});


// --- 6. Démarrage du Serveur ---
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});