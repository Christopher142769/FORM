// server/server.js - BACKEND FINAL MODIFIÉ : PUBLICATION PAR DÉFAUT & CORRECTION ROUTE SUBMISSION

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const QRCode = require('qrcode');
// 💡 CORRECTION : Activation du chargement des variables d'environnement
require('dotenv').config(); 

const app = express();

// --- Définition des Variables d'Environnement ---
const FRONTEND_URL = process.env.FRONTEND_URL || "https://startup-form.onrender.com"; 
const PORT = process.env.PORT || 5000; 
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_PAR_DEFAUT_NE_PAS_UTILISER_EN_PROD'; 

// Affichage du secret
console.log(`JWT_SECRET chargé : ${JWT_SECRET.substring(0, 5)}...`); 


// --- 1. Middleware de base ---
// Augmentation de la limite pour l'upload potentiel de logo (en base64) et de configurations complexes.
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- 2. Configuration MongoDB ---
const MONGODB_URI = process.env.MONGODB_URI; 

if (!MONGODB_URI) {
    console.error("ERREUR: La variable d'environnement MONGODB_URI n'est pas définie. Connexion à MongoDB impossible.");
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connexion à MongoDB réussie !'))
    .catch(err => console.error('Erreur de connexion à MongoDB:', err));


// --- 3. Définition des Schémas ---

// Schéma pour un champ de formulaire (texte, nombre, choix, etc.)
const FieldSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // ID unique côté frontend pour la logique
    type: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: false },
    options: [String], // Pour les types 'select', 'radio', 'checkbox'
    placeholder: { type: String },
    // Logique conditionnelle (ex: afficher si 'fieldId' a la valeur 'value')
    conditional: {
        fieldId: { type: String, default: null },
        value: { type: String, default: null },
    }
});

// Schéma pour une soumission (une réponse au formulaire)
const SubmissionSchema = new mongoose.Schema({
    submittedAt: { type: Date, default: Date.now },
    data: [{
        fieldId: { type: String, required: true },
        value: { type: mongoose.Schema.Types.Mixed, required: true } // Peut être String, Array, Number
    }]
});

// Schéma principal du Formulaire
const FormSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    // Jeton public (UUID) - 💡 CRITIQUE: doit être unique
    token: { type: String, unique: true, required: true }, 
    // ⚠️ MODIFICATION DEMANDÉE : Statut par défaut à 'published'
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    fields: [FieldSchema],
    submissions: [SubmissionSchema],
    logoBase64: { type: String, default: null }, // Champ pour le logo en Base64
    settings: {
        allowMultipleSubmissions: { type: Boolean, default: false },
        redirectUrl: { type: String, default: null },
        theme: { type: String, enum: ['light', 'dark'], default: 'light' }
    }
}, { timestamps: true });

// Schéma de l'Utilisateur
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, default: 'Mon Entreprise' }
});

const User = mongoose.model('User', UserSchema);
const Form = mongoose.model('Form', FormSchema);


// --- 4. Middleware d'Authentification ---

// Générer un token JWT
const generateToken = (id, companyName) => {
    return jwt.sign({ id, companyName }, JWT_SECRET, {
        expiresIn: '30d',
    });
};

// Middleware de protection
const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Récupérer le token du header
            token = req.headers.authorization.split(' ')[1];

            // Vérifier le token
            const decoded = jwt.verify(token, JWT_SECRET);

            // Attacher l'ID de l'utilisateur à la requête (sans le mot de passe)
            req.user = decoded.id; 
            req.companyName = decoded.companyName; // Récupérer le nom de l'entreprise
            next();
        } catch (error) {
            // console.error(error); // Décommentez pour déboguer les erreurs de token
            res.status(401).json({ message: 'Non autorisé, token invalide.' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Non autorisé, pas de token fourni.' });
    }
};


// --- 5. Routes API ---

// A. AUTHENTIFICATION

// Route Enregistrement
app.post('/api/auth/register', async (req, res) => {
    const { email, password, companyName } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Veuillez fournir un email et un mot de passe.' });
    }

    try {
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ message: 'Cet utilisateur existe déjà.' });
        }

        // Hashage du mot de passe
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Création de l'utilisateur
        const user = await User.create({
            email,
            password: hashedPassword,
            companyName: companyName || 'Mon Entreprise'
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                email: user.email,
                companyName: user.companyName,
                token: generateToken(user._id, user.companyName)
            });
        } else {
            res.status(400).json({ message: 'Données utilisateur invalides.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur serveur lors de l\'enregistrement.' });
    }
});

// Route Connexion
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Veuillez fournir un email et un mot de passe.' });
    }

    try {
        const user = await User.findOne({ email });

        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                _id: user._id,
                email: user.email,
                companyName: user.companyName,
                token: generateToken(user._id, user.companyName)
            });
        } else {
            res.status(401).json({ message: 'Email ou mot de passe invalide.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur serveur lors de la connexion.' });
    }
});

// Route Utilisateur Courant
app.get('/api/auth/me', protect, async (req, res) => {
    try {
        // Le middleware 'protect' a attaché l'ID et le nom d'entreprise
        const user = await User.findById(req.user).select('-password'); 

        if (user) {
            res.json({
                _id: user._id,
                email: user.email,
                companyName: user.companyName,
            });
        } else {
            res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération des données utilisateur.' });
    }
});


// B. FORMULAIRES (ADMIN)

// B.1. ROUTE CRÉATION DE FORMULAIRE
app.post('/api/forms', protect, async (req, res) => {
    const { title } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Le titre du formulaire est requis.' });
    }

    try {
        // 💡 CORRECTION CRITIQUE : Préfixer le token pour éviter l'insertion de 'null' ou des collisions
        const token = 'form-' + new mongoose.Types.ObjectId().toHexString(); // Génère un token unique et non-null

        const form = await Form.create({
            userId: req.user,
            title,
            token,
            fields: [] // Nouveau formulaire vide. Le statut par défaut est maintenant 'published'
        });

        // Supprimer le champ 'submissions' pour l'affichage initial dans le dashboard
        const formResponse = form.toObject();
        delete formResponse.submissions;
        
        res.status(201).json(formResponse);
    } catch (error) {
        console.error(error);
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Erreur de duplication (token), veuillez réessayer.' });
        }
        res.status(500).json({ message: 'Erreur lors de la création du formulaire.' });
    }
});

// B.2. ROUTE MISE À JOUR (SAUVEGARDE)
app.put('/api/forms/:id', protect, async (req, res) => {
    const { title, description, fields, status, settings } = req.body;

    try {
        const form = await Form.findById(req.params.id);

        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        // Mettre à jour les champs
        const updatedForm = await Form.findByIdAndUpdate(
            req.params.id, 
            { title, description, fields, status, settings }, 
            { new: true, runValidators: true }
        ).select('-submissions'); // Exclure les soumissions pour un transfert de données plus rapide

        res.json(updatedForm);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du formulaire.' });
    }
});

// B.3. ROUTE SUPPRESSION
app.delete('/api/forms/:id', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id);

        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        await form.deleteOne();
        res.status(200).json({ message: 'Formulaire supprimé avec succès.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la suppression du formulaire.' });
    }
});

// 💡 NOUVELLE ROUTE : B.4. ROUTE LOGO UPLOAD
app.post('/api/forms/:id/logo', protect, async (req, res) => {
    const { logoData } = req.body; // logoData est la chaîne Base64 du frontend

    if (!logoData) {
        return res.status(400).json({ message: 'Données de logo (Base64) manquantes.' });
    }

    try {
        const form = await Form.findById(req.params.id);

        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        // Mettre à jour uniquement le champ logoBase64
        const updatedForm = await Form.findByIdAndUpdate(
            req.params.id, 
            { logoBase64: logoData }, 
            { new: true, runValidators: true }
        ).select('-submissions');

        // Retourner le chemin du logo (qui est la donnée Base64 elle-même)
        res.json({ 
            message: 'Logo mis à jour avec succès.',
            logoPath: updatedForm.logoBase64 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du logo.' });
    }
});

// B.5. ROUTE LISTE DES FORMULAIRES DE L'UTILISATEUR
app.get('/api/forms', protect, async (req, res) => {
    try {
        // La liste inclut les soumissions pour permettre le comptage dans le frontend
        const forms = await Form.find({ userId: req.user }).sort({ createdAt: -1 });
        
        // Mappage pour exclure les données massives et les tokens sensibles du résultat de la liste
        const sanitizedForms = forms.map(form => {
            const formObj = form.toObject();
            return formObj;
        });

        res.json(sanitizedForms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération des formulaires.' });
    }
});

// B.6. ROUTE DÉTAIL D'UN FORMULAIRE (POUR L'ÉDITION)
app.get('/api/forms/:id', protect, async (req, res) => {
    try {
        // Inclure les submissions pour l'affichage des résultats
        const form = await Form.findById(req.params.id);

        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        res.json(form);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération du formulaire.' });
    }
});

// B.7. ROUTE STATISTIQUES SIMPLES (Nombre de soumissions)
app.get('/api/forms/:id/stats', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id).select('submissions');

        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        const totalSubmissions = form.submissions.length;
        
        // Exemples de stats (à développer si besoin)
        const stats = {
            totalSubmissions,
            // Autres stats basiques...
        };

        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération des statistiques.' });
    }
});


// B.8. ROUTE EXPORT DES DONNÉES (CSV)
// Utilise un mécanisme simple pour générer un fichier CSV
app.get('/api/forms/:id/export', protect, async (req, res) => {
    const { format } = req.query;

    if (!format || (format !== 'csv' && format !== 'pdf')) {
        return res.status(400).json({ message: 'Format d\'exportation non spécifié (doit être csv ou pdf).' });
    }

    try {
        // On récupère toutes les données du formulaire
        const form = await Form.findById(req.params.id);

        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        if (format === 'csv') {
             // Extraction des en-têtes (labels de champs)
             const headers = ['ID_Soumission', 'Date_Soumission', ...form.fields.map(f => f.label)];
             let csvData = headers.join(';') + '\n';
             
             // Extraction des données
             form.submissions.forEach(submission => {
                 let row = [
                    submission._id.toString(), 
                    submission.submittedAt.toISOString()
                 ];

                 // On itère sur les en-têtes pour s'assurer que l'ordre des colonnes est respecté
                 form.fields.forEach(field => {
                    const dataEntry = submission.data.find(d => d.fieldId === field._id);
                    let value = dataEntry ? dataEntry.value : '';

                    // Gestion des valeurs multiples pour les checkboxes
                    if (Array.isArray(value)) {
                        value = value.join(', ');
                    }
                    
                    // Nettoyage de la valeur (remplacer les sauts de ligne, guillemets, etc.) pour le CSV
                    value = String(value).replace(/"/g, '""').replace(/\n/g, ' ').replace(/;/g, ',');
                    row.push(value);
                 });

                 csvData += row.join(';') + '\n';
             });

             // Envoi du fichier CSV
             res.setHeader('Content-Type', 'text/csv; charset=utf-8');
             res.setHeader('Content-Disposition', `attachment; filename=\"${form.title}_export_${new Date().toISOString().slice(0, 10)}.csv\"`);
             // Ajout du BOM (Byte Order Mark) pour l'encodage UTF-8 et la compatibilité Excel
             return res.send(Buffer.from('\ufeff' + csvData, 'utf8')); 
        } else if (format === 'pdf') {
             // La génération de PDF est complexe. On simule un message d'erreur.
             return res.status(501).json({ message: "La génération de PDF n'est pas encore supportée sur ce backend de démonstration. Veuillez utiliser l'export Excel (CSV)." });
        }

        return res.status(400).json({ message: 'Format d\'exportation non supporté.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de l\'exportation des données.' });
    }
});


// C. FORMULAIRE (PUBLIC)

// C.1. ROUTE RÉCUPÉRATION (SANS AUTH)
app.get('/api/public/form/:token', async (req, res) => {
    try {
        // Seuls les formulaires publiés sont accessibles publiquement
        const form = await Form.findOne({ token: req.params.token, status: 'published' }).select('-submissions'); 

        if (!form) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou non publié.' });
        }

        // Simplification de la réponse (on retire le token pour plus de sécurité)
        const formResponse = form.toObject();
        delete formResponse.token;
        delete formResponse.userId;

        // NOTE: formResponse contient maintenant la propriété logoBase64 pour le frontend
        res.json(formResponse); 
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération du formulaire public.' });
    }
});

// C.2. ROUTE SOUMISSION (SANS AUTH)
// Version tolérante + logs de debug
app.post('/api/public/form/:token/submit', async (req, res) => { 
    
    console.log('--- Nouvelle soumission reçue ---');
    console.log('Headers content-type :', req.headers['content-type']);
    console.log('Corps brut reçu :', req.body);

    if (!req.body) {
        return res.status(400).json({
            message: 'Corps de requête manquant. Assurez-vous que le content-type est application/json.',
        });
    }

    // On essaie de récupérer un tableau de données, peu importe la forme exacte
    let data = req.body.data;

    if (!Array.isArray(data)) {
        // Cas 1 : le front envoie directement un tableau en racine
        if (Array.isArray(req.body)) {
            data = req.body;
        }
        // Cas 2 : le front envoie un seul objet { fieldId, value }
        else if (req.body.fieldId && req.body.value !== undefined) {
            data = [req.body];
        }
    }

    console.log('Données interprétées côté backend :', data);
    console.log('Array.isArray(data) =', Array.isArray(data));

    if (!data || !Array.isArray(data) || data.length === 0) {
        return res.status(400).json({
            message: 'Les données de soumission sont manquantes ou invalides.',
            debugBody: req.body,
        });
    }

    try {
        const form = await Form.findOne({ token: req.params.token, status: 'published' });

        if (!form) {
            // Le 404 est correct car si le formulaire est non publié ou introuvable, la soumission échoue
            return res.status(404).json({ message: 'Formulaire non trouvé ou non publié.' });
        }

        // Ajout de la nouvelle soumission
        form.submissions.push({ data });

        // Sauvegarde du formulaire mis à jour
        await form.save();
        
        // Gérer la redirection après la soumission
        const settings = form.settings || {};
        const redirectUrl = settings.redirectUrl;

        if (redirectUrl) {
            return res.json({ message: 'Soumission réussie', success: true, redirect: true, redirectUrl });
        }
        
        res.json({ message: 'Soumission réussie', success: true, redirect: false });

    } catch (error) {
        console.error('Erreur lors de la soumission du formulaire :', error);
        res.status(500).json({ message: 'Erreur lors de la soumission du formulaire.' });
    }
});


// D. ROUTE DE REDIRECTION PUBLIQUE (INCHANGÉE)
// Intercepte les requêtes sur le domaine du backend et redirige vers le FRONTEND
app.get('/form/:token', async (req, res) => {
    if (!FRONTEND_URL) {
        return res.status(500).send("Erreur de configuration : FRONTEND_URL non défini pour la redirection.");
    }
    // Redirection permanente vers l'URL du frontend
    res.redirect(302, `${FRONTEND_URL}/form/${req.params.token}`);
});


// --- 6. Démarrage du Serveur ---
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
