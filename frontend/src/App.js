// client/src/App.js - V24 FINAL : Correction Submission Schéma [String]

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import { 
    Container, Nav, Navbar, Button, Card, Row, Col, 
    Form, Alert, ListGroup, InputGroup, Spinner, Modal 
} from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react'; 
// 💡 NOUVEAU : Import de la librairie de signature
import SignaturePad from 'react-signature-canvas';

import './App.css';
import './PublicForm.css';

// 💡 API
const API_URL = 'https://form-backend-pl5d.onrender.com/api';
const THEME_KEY = 'formgen-theme';

// 💡 FONCTION UTILITAIRE : Génère un ID unique simple
const generateUniqueId = () => new Date().getTime().toString(36) + Math.random().toString(36).substr(2);


// --- SWITCH DE THÈME GLOBAL (Inchangé) ---
const ThemeToggle = ({ theme, toggleTheme }) => {
    const isLight = theme === 'light';
    return (
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Changer le thème"
        >
            <span className="theme-toggle-icon">
                {isLight ? '🌙' : '☀️'}
            </span>
            <span className="theme-toggle-label d-none d-md-inline">
                {isLight ? 'Sombre' : 'Clair'}
            </span>
        </button>
    );
};

// --- LOADER CENTRÉ (Inchangé) ---
const Loader = () => (
    <div className="loader-overlay">
        <div className="loader-card">
            <Spinner animation="border" role="status" className="spinner-border-custom">
                <span className="visually-hidden">Chargement...</span>
            </Spinner>
            <p className="loader-text mt-3">Préparation de ton espace FormGen Pro...</p>
        </div>
    </div>
);

// --- MODALE DE DÉTAILS DE SOUMISSION (Inchangé) ---
const SubmissionDetailsModal = ({ show, handleClose, submission, formDetails }) => {
    if (!submission || !formDetails) return null;

    // 💡 MODIFICATION : Mapping des FieldId vers les Labels (pour une meilleure lisibilité)
    const fieldMap = formDetails.fields.reduce((map, field) => {
        map[field._id] = field.label;
        return map;
    }, {});
    
    // Conversion des données en un tableau de paires label-valeur
    const dataEntries = submission.data.map(d => {
        let displayValue = d.value;

        // 💡 Gestion de la valeur qui est maintenant un tableau de chaînes dans le backend
        if (Array.isArray(d.value)) {
            displayValue = d.value.join(', ');
        } else if (typeof d.value === 'boolean') {
            displayValue = d.value ? 'Oui' : 'Non';
        } else if (d.value && d.value.startsWith('data:image/png;base64,')) {
             // 💡 Affichage de la signature/image en Base64
            displayValue = `[Image/Signature] : ${d.value.substring(0, 50)}...`;
        }
        
        return { 
            label: fieldMap[d.fieldId] || d.fieldId, // Utilise le Label du champ si trouvé
            value: displayValue
        };
    }).filter(entry => entry.value); // N'affiche que les champs qui ont une valeur

    return (
        <Modal show={show} onHide={handleClose} size="lg" centered>
            <Modal.Header closeButton className="modal-header-custom">
                <Modal.Title>Détails de la Soumission</Modal.Title>
            </Modal.Header>
            <Modal.Body className="modal-body-details">
                <p className="text-muted mb-3">
                    **Formulaire :** {formDetails.title} | **Soumis le :** {new Date(submission.submittedAt).toLocaleString()}
                </p>
                <ListGroup variant="flush">
                    {dataEntries.length > 0 ? (
                        dataEntries.map((entry, index) => (
                            <ListGroup.Item key={index} className="d-flex flex-column flex-md-row justify-content-between align-items-start details-item">
                                <span className="details-key fw-bold me-3" style={{ minWidth: '150px' }}>
                                    {entry.label} :
                                </span>
                                <span className="details-value text-break">
                                    {/* 💡 Si c'est une image (signature/upload), on l'affiche */}
                                    {entry.value.startsWith('[Image/Signature]') ? (
                                        <>
                                            {entry.value}
                                            {/* Si la valeur commence par data:image/png;base64, c'est la signature/image */}
                                            {submission.data.find(d => fieldMap[d.fieldId] === entry.label)?.value?.startsWith('data:image/') && (
                                                <img 
                                                    src={submission.data.find(d => fieldMap[d.fieldId] === entry.label)?.value}
                                                    alt="Contenu de soumission"
                                                    style={{ maxWidth: '100%', maxHeight: '200px', border: '1px solid #ccc', marginTop: '10px' }}
                                                />
                                            )}
                                        </>
                                    ) : (
                                        entry.value.toString()
                                    )}
                                </span>
                            </ListGroup.Item>
                        ))
                    ) : (
                        <Alert variant="warning" className="text-center">
                            Aucune donnée de champ trouvée pour cette soumission.
                        </Alert>
                    )}
                </ListGroup>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={handleClose}>
                    Fermer
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

// --- COMPOSANT D'ÉDITION DE LOGIQUE CONDITIONNELLE (Inchangé) ---
const ConditionalLogicEditor = ({ form, setForm }) => {
    // Filtrer les champs qui peuvent déclencher une logique (radio, select)
    const triggerFields = form.fields.filter(f => ['radio', 'select'].includes(f.type) && f.options && f.options.length > 0);
    
    // Filtrer les champs qui peuvent être affichés conditionnellement (tous sauf eux-mêmes)
    const targetFields = form.fields;

    const [selectedTriggerFieldLabel, setSelectedTriggerFieldLabel] = useState('');
    const [selectedValue, setSelectedValue] = useState('');
    const [selectedTargetFieldLabel, setSelectedTargetFieldLabel] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        // Réinitialiser les sélections si la liste des champs change
        setSelectedTriggerFieldLabel('');
        setSelectedValue('');
        setSelectedTargetFieldLabel('');
        setError('');
    }, [form.fields]);


    const addLogic = () => {
        setError('');
        if (!selectedTriggerFieldLabel || !selectedValue || !selectedTargetFieldLabel) {
            setError("Veuillez sélectionner un champ déclencheur, une valeur d'option et un champ cible.");
            return;
        }

        // Trouver l'index du champ déclencheur
        const triggerIndex = form.fields.findIndex(f => f.label === selectedTriggerFieldLabel);
        if (triggerIndex === -1) return;

        // Le champ cible est désigné par son label nettoyé (que l'on utilise comme ID)
        const targetFieldId = selectedTargetFieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');


        if (selectedTriggerFieldLabel === selectedTargetFieldLabel) {
             setError("Un champ ne peut pas se déclencher lui-même.");
             return;
        }

        const newLogic = {
            value: selectedValue,
            showFieldId: targetFieldId
        };

        const newFields = form.fields.map((field, index) => {
            if (index === triggerIndex) {
                // Ajouter la nouvelle logique ou remplacer l'existante si la valeur est la même
                const existingLogic = field.conditionalLogic || [];
                const updatedLogic = existingLogic.filter(l => l.value !== selectedValue);
                
                return {
                    ...field,
                    conditionalLogic: [...updatedLogic, newLogic]
                };
            }
            return field;
        });

        setForm({ ...form, fields: newFields });
        setSelectedValue('');
        setSelectedTargetFieldLabel('');
    };

    const removeLogic = (triggerFieldLabel, value) => {
        const newFields = form.fields.map(field => {
            if (field.label === triggerFieldLabel) {
                return {
                    ...field,
                    conditionalLogic: (field.conditionalLogic || []).filter(l => l.value !== value)
                };
            }
            return field;
        });
        setForm({ ...form, fields: newFields });
    };

    const currentTriggerField = form.fields.find(f => f.label === selectedTriggerFieldLabel);

    return (
        <Card className="mt-4 p-3 animated-card-small logic-card">
            <h5 className="mb-3">🔗 Logique Conditionnelle (Afficher si...)</h5>
            
            {error && <Alert variant="danger" size="sm">{error}</Alert>}

            <Row className="g-3 align-items-end">
                <Col xs={12} md={4}>
                    <Form.Label>Champ Déclencheur</Form.Label>
                    <Form.Select 
                        value={selectedTriggerFieldLabel} 
                        onChange={(e) => setSelectedTriggerFieldLabel(e.target.value)}
                    >
                        <option value="">Sélectionnez une question...</option>
                        {triggerFields.map((field, index) => (
                            <option key={index} value={field.label}>
                                {field.label}
                            </option>
                        ))}
                    </Form.Select>
                </Col>
                
                {currentTriggerField && (
                    <Col xs={12} md={3}>
                        <Form.Label>Si l'option est...</Form.Label>
                        <Form.Select 
                            value={selectedValue} 
                            onChange={(e) => setSelectedValue(e.target.value)}
                        >
                            <option value="">Sélectionnez une valeur...</option>
                            {currentTriggerField.options.map((option, index) => (
                                <option key={index} value={option}>{option}</option>
                            ))}
                        </Form.Select>
                    </Col>
                )}

                <Col xs={12} md={4}>
                    <Form.Label>Afficher le Champ Cible</Form.Label>
                    <Form.Select 
                        value={selectedTargetFieldLabel} 
                        onChange={(e) => setSelectedTargetFieldLabel(e.target.value)}
                    >
                        <option value="">Sélectionnez le champ à montrer...</option>
                        {targetFields
                            .filter(f => f.label !== selectedTriggerFieldLabel)
                            .map((field, index) => (
                                <option key={index} value={field.label}>
                                    {field.label} ({field.type})
                                </option>
                            ))}
                    </Form.Select>
                </Col>
                
                <Col xs={12} md={1} className="d-grid">
                    <Button onClick={addLogic} variant="primary" className="btn-add-logic">+</Button>
                </Col>
            </Row>

            <h6 className="mt-3">Logiques Actives :</h6>
            <ListGroup variant="flush">
                {form.fields.filter(f => f.conditionalLogic && f.conditionalLogic.length > 0).map(trigger => (
                    trigger.conditionalLogic.map((logic, index) => (
                        <ListGroup.Item 
                            key={index} 
                            className="d-flex justify-content-between align-items-center bg-light-subtle small py-1"
                        >
                            <span>
                                Si **{trigger.label}** est **'{logic.value}'**, alors afficher le champ **'{logic.showFieldId.toUpperCase().replace(/_/g, ' ')}'**
                            </span>
                            <Button variant="outline-danger" size="sm" onClick={() => removeLogic(trigger.label, logic.value)}>
                                ✕
                            </Button>
                        </ListGroup.Item>
                    ))
                ))}
                {form.fields.filter(f => f.conditionalLogic && f.conditionalLogic.length > 0).length === 0 && (
                    <p className="text-muted small mt-2">Aucune logique conditionnelle définie.</p>
                )}
            </ListGroup>

        </Card>
    );
};


// --- PAGE D'ACCUEIL (HYPER-IMMERSION) (Inchangé) ---
const WelcomePage = ({ navigate }) => (
    <div className="welcome-container">
        <div className="welcome-content">
            <div className="welcome-badge">Nouvelle Génération • SaaS Forms</div>
            <h1 className="welcome-title">
                Bienvenue sur FORMGEN Pro !
            </h1>
            <p className="lead mt-4 welcome-subtitle">
                Crée, partage et analyse tes formulaires en un éclair.  
                Une expérience pensée pour les équipes modernes, pas pour les dinosaures.
            </p>
            <div className="welcome-actions mt-4">
                <Button 
                    variant="success" 
                    onClick={() => navigate('/auth')} 
                    className="btn-vibrant"
                >
                    Commencer l'Aventure
                </Button>
                <Button 
                    variant="outline-light" 
                    onClick={() => navigate('/auth')} 
                    className="btn-secondary-ghost ms-0 ms-md-3 mt-3 mt-md-0"
                >
                    Voir le Dashboard Demo
                </Button>
            </div>
            <div className="welcome-footnote mt-4">
                Aucun code, aucun stress. Juste des formulaires qui convertissent.
            </div>
        </div>
    </div>
);

// --- PARTIE 1 : AUTHENTIFICATION (Inchangé) ---
const Auth = ({ onAuthSuccess, apiUrl, navigate }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const endpoint = isLogin ? 'login' : 'register';
        
        // 💡 CORRECTION APPLIQUÉE : Synchronisation du champ 'email' avec le backend
        const data = isLogin 
            ? { email, password } 
            : { email, password, companyName }; 

        try {
            const response = await axios.post(`${apiUrl}/auth/${endpoint}`, data);
            onAuthSuccess(response.data.token, response.data.user);
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue.');
        }
    };

    return (
        <div className="auth-page-container">
            <div className="auth-page-gradient" />
            <Card className="shadow-lg p-4 mx-auto auth-card animated-card">
                <div className="auth-card-header">
                    <div className="auth-chip">{isLogin ? 'Espace sécurisé' : 'Onboard rapide'}</div>
                    <Card.Title className="text-center mb-1 auth-title">
                        {isLogin ? '🔑 Connexion Entreprise' : '✨ Inscription Entreprise'}
                    </Card.Title>
                    <p className="text-center auth-subtitle">
                        {isLogin
                            ? 'Rentre dans ton espace pour créer des formulaires qui claquent.'
                            : 'Crée ton compte et commence à capturer des réponses en 2 minutes.'}
                    </p>
                </div>
                {error && <Alert variant="danger" className="auth-error">{error}</Alert>}
                <Form onSubmit={handleSubmit} className="auth-form">
                    {!isLogin && (
                        <Form.Group className="mb-3">
                            <Form.Label>Nom de l&apos;Entreprise</Form.Label>
                            <Form.Control 
                                type="text" 
                                value={companyName} 
                                onChange={(e) => setCompanyName(e.target.value)} 
                                required={!isLogin} 
                                className="custom-input"
                                placeholder="Ex: PixelStudio, NovaCorp..."
                            />
                        </Form.Group>
                    )}
                    <Form.Group className="mb-3">
                        <Form.Label>Email</Form.Label>
                        <Form.Control 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                            className="custom-input"
                            placeholder="contact@entreprise.com"
                        />
                    </Form.Group>
                    <Form.Group className="mb-1">
                        <Form.Label>Mot de passe</Form.Label>
                        <Form.Control 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                            className="custom-input"
                            placeholder="••••••••"
                        />
                    </Form.Group>
                    <small className="text-muted d-block mb-3">
                        Minimum 8 caractères recommandés.
                    </small>
                    <Button variant="primary" type="submit" className="w-100 mt-2 btn-primary-custom">
                        {isLogin ? 'Se Connecter' : 'S\'inscrire'}
                    </Button>
                </Form>
                <div className="auth-switch-zone mt-3 text-center">
                    <Button 
                        variant="link" 
                        onClick={() => setIsLogin(!isLogin)} 
                        className="text-secondary-custom auth-switch-btn"
                    >
                        {isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
                    </Button>
                    <Button 
                        variant="link" 
                        onClick={() => navigate('/')} 
                        className="mt-2 text-muted auth-back-home"
                    >
                        ← Retour à l&apos;accueil
                    </Button>
                </div>
            </Card>
        </div>
    );
};

// --- PARTIE 2 : CONSTRUCTEUR DE FORMULAIRE (Inchangé) ---
const FormBuilder = ({ form, setForm, onSave, onUploadLogo, token, apiUrl }) => {
    const [fieldLabel, setFieldLabel] = useState('');
    // 💡 MODIF : Ajout des nouveaux types de champs
    const [fieldType, setFieldType] = useState('text'); 
    const [fieldRequired, setFieldRequired] = useState(true); 
    const [logoFile, setLogoFile] = useState(null); 
    const [uploadError, setUploadError] = useState('');
    
    // NOUVEAUX ÉTATS POUR LES OPTIONS ET FICHIERS
    const [fieldOptions, setFieldOptions] = useState(''); 
    const [maxSizeMB, setMaxSizeMB] = useState(10); 
    const [allowedTypes, setAllowedTypes] = useState(['document']);

    const isPublished = form.status === 'published';

    const addField = () => {
        if (fieldLabel.trim()) {
            let newField = { 
                _id: generateUniqueId(), 
                label: fieldLabel, 
                type: fieldType, 
                required: fieldRequired,
                options: [],
                fileConfig: {},
                conditionalLogic: []
            };

            // Ajout des options pour les types basés sur un choix
            if (['radio', 'select', 'checkbox'].includes(fieldType)) {
                const optionsArray = fieldOptions.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
                if (optionsArray.length === 0) {
                    alert("Veuillez entrer au moins une option pour ce type de champ.");
                    return;
                }
                newField.options = optionsArray;
            }

            // Ajout de la configuration pour le type 'file'
            if (fieldType === 'file') {
                if (allowedTypes.length === 0) {
                     alert("Veuillez sélectionner au moins un type de fichier autorisé.");
                    return;
                }
                newField.fileConfig = {
                    maxSizeMB: parseInt(maxSizeMB),
                    allowedTypes: allowedTypes
                };
            }
            // 💡 Signature et Date n'ont pas d'options/config supplémentaires
            

            setForm({
                ...form,
                fields: [...form.fields, newField]
            });
            
            // Réinitialisation des états
            setFieldLabel('');
            setFieldRequired(true);
            setFieldOptions('');
            setMaxSizeMB(10);
            setAllowedTypes(['document']);
        }
    };

    const removeField = (index) => {
        const newFields = form.fields.filter((_, i) => i !== index);
        setForm({ ...form, fields: newFields });
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoFile(reader.result); 
                setUploadError('');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleLogoUpload = async () => {
        if (!logoFile) { 
            setUploadError("Veuillez d'abord sélectionner un fichier.");
            return;
        }
        if (!form._id) { 
             setUploadError("Erreur: Le formulaire doit être sauvegardé avant d'uploader le logo.");
             return;
        }

        try {
            const response = await axios.post(
                `${apiUrl}/forms/${form._id}/logo`, 
                { logoData: logoFile }, 
                {
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            // CORRECTION : Utiliser logoBase64 pour la cohérence
            setForm({ ...form, logoBase64: response.data.logoPath }); 
            setLogoFile(null); 
            setUploadError('');
            alert("Logo stocké dans MongoDB avec succès !");
            onUploadLogo();
        } catch (error) {
            setUploadError(error.response?.data?.message || "Erreur lors de l'upload.");
        }
    };

    return (
        <Card className="mb-4 animated-card builder-card">
            <Card.Header className="card-header-builder text-white">
                <Row className="align-items-center g-2">
                    <Col xs={12} md="auto">
                        <div className="builder-title-zone">
                            <span className="builder-chip">Builder</span>
                            <h4 className="mb-0">🏗️ Constructeur de Formulaire</h4>
                        </div>
                    </Col>
                    <Col className="text-md-end mt-2 mt-md-0">
                        {/* Bouton de statut de publication */}
                        <div className="d-flex align-items-center justify-content-end">
                            <Form.Group className="me-3 mb-0">
                                <Form.Check
                                    type="switch"
                                    id="publish-switch"
                                    label={isPublished ? 'Publié (Accessible)' : 'Brouillon (Privé)'}
                                    checked={isPublished}
                                    onChange={(e) => setForm({ 
                                        ...form, 
                                        status: e.target.checked ? 'published' : 'draft' 
                                    })}
                                    className="custom-switch-lg"
                                />
                            </Form.Group>
                            <Button 
                                variant="light" 
                                onClick={onSave} 
                                disabled={!form.title.trim()} 
                                className="btn-save-custom"
                            >
                                <span className="btn-save-icon">💾</span> Sauvegarder
                            </Button>
                        </div>
                    </Col>
                </Row>
            </Card.Header>
            <Card.Body className="builder-body">
                <Form.Group className="mb-3">
                    <Form.Label>Titre du Formulaire</Form.Label>
                    <Form.Control 
                        type="text" 
                        placeholder="Ex: Enquête de Satisfaction" 
                        value={form.title} 
                        onChange={(e) => setForm({ ...form, title: e.target.value })} 
                        className="custom-input"
                    />
                    <small className="text-muted">
                        Ce titre apparaîtra en grand sur la page publique.
                    </small>
                </Form.Group>

                <div className="builder-section-divider mb-3" />

                <Row className="mb-4 align-items-end builder-row g-3">
                    <Col xs={12} md={4}>
                        <Form.Group>
                            <Form.Label>Type de Champ</Form.Label>
                            <Form.Select 
                                value={fieldType} 
                                onChange={(e) => {
                                    setFieldType(e.target.value);
                                    setFieldOptions(''); // Réinitialiser les options si le type change
                                }} 
                                className="custom-select"
                            >
                                <option value="text">Texte Court</option>
                                <option value="textarea">Paragraphe</option>
                                <option value="email">Email</option>
                                <option value="number">Nombre</option>
                                <option value="radio">Bouton Radio (Choix unique)</option>
                                <option value="select">Liste Déroulante (Choix unique)</option>
                                <option value="checkbox">Case(s) à cocher (Multiple)</option>
                                <option value="date">Sélection de Date 📅</option>
                                <option value="signature">Signature à la main ✍️</option>
                                <option value="file">Upload de Fichier</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                    <Col xs={12} md={4}>
                        <Form.Group>
                            {/* Label du champ devient la Question/Titre */}
                            <Form.Label>Question / Titre</Form.Label> 
                            <Form.Control 
                                type="text" 
                                placeholder="Ex: Quel est votre Nom Complet ?" 
                                value={fieldLabel} 
                                onChange={(e) => setFieldLabel(e.target.value)} 
                                className="custom-input"
                            />
                        </Form.Group>
                    </Col>
                    
                    <Col xs={6} md={2}>
                        <Form.Group>
                            <Form.Label>Obligatoire</Form.Label>
                            <Form.Check 
                                type="checkbox"
                                label="Oui"
                                checked={fieldRequired}
                                onChange={(e) => setFieldRequired(e.target.checked)}
                                className="custom-checkbox"
                            />
                        </Form.Group>
                    </Col>

                    <Col xs={6} md={2} className="d-grid">
                        <Button 
                            onClick={addField} 
                            variant="info" 
                            className="btn-add-field"
                        >
                            + Ajouter
                        </Button>
                    </Col>
                    
                    {/* Champ d'options pour les types de choix */}
                    {['radio', 'select', 'checkbox'].includes(fieldType) && (
                        <Col xs={12}>
                            <Form.Group>
                                <Form.Label>Options de Choix <span className="text-muted">(Séparées par des virgules)</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Ex: Option 1, Option 2, Autre Choix"
                                    value={fieldOptions}
                                    onChange={(e) => setFieldOptions(e.target.value)}
                                    className="custom-input"
                                />
                            </Form.Group>
                        </Col>
                    )}
                    
                    {/* Configuration de l'upload pour le type 'file' */}
                    {fieldType === 'file' && (
                        <Row className="g-3 mt-1 px-0 mx-0">
                            <Col xs={12} md={3}>
                                <Form.Group>
                                    <Form.Label>Taille Max (Mo)</Form.Label>
                                    <Form.Control
                                        type="number"
                                        value={maxSizeMB}
                                        onChange={(e) => setMaxSizeMB(e.target.value)}
                                        min="1"
                                        max="50"
                                        className="custom-input"
                                    />
                                </Form.Group>
                            </Col>
                            <Col xs={12} md={9}>
                                <Form.Group>
                                    <Form.Label>Types Autorisés</Form.Label>
                                    <div className="d-flex flex-wrap gap-3 mt-2">
                                        <Form.Check
                                            type="checkbox"
                                            label="Image (.jpg, .png, etc.)"
                                            checked={allowedTypes.includes('image')}
                                            onChange={(e) => setAllowedTypes(prev => 
                                                e.target.checked ? [...prev, 'image'] : prev.filter(t => t !== 'image')
                                            )}
                                            id="check-image"
                                            className="custom-checkbox"
                                        />
                                        <Form.Check
                                            type="checkbox"
                                            label="Document (.pdf, .docx, etc.)"
                                            checked={allowedTypes.includes('document')}
                                            onChange={(e) => setAllowedTypes(prev => 
                                                e.target.checked ? [...prev, 'document'] : prev.filter(t => t !== 'document')
                                            )}
                                            id="check-document"
                                            className="custom-checkbox"
                                        />
                                        <Form.Check
                                            type="checkbox"
                                            label="Autre (Tout type)"
                                            checked={allowedTypes.includes('other')}
                                            onChange={(e) => setAllowedTypes(prev => 
                                                e.target.checked ? [...prev, 'other'] : prev.filter(t => t !== 'other')
                                            )}
                                            id="check-other"
                                            className="custom-checkbox"
                                        />
                                    </div>
                                    <small className="text-muted">
                                        L'upload réel des fichiers sera stocké en Base64 dans la BDD.
                                    </small>
                                </Form.Group>
                            </Col>
                        </Row>
                    )}
                </Row>
                
                <h5 className="mt-4 mb-3 section-title-with-pill">
                    Champs Actuels <span className="section-pill">{form.fields.length}</span>
                </h5>
                <ListGroup className="mb-4 list-group-custom">
                    {form.fields.map((field, index) => (
                        <ListGroup.Item 
                            key={index} 
                            className="d-flex justify-content-between align-items-center list-item-custom"
                        >
                            <div className="me-3">
                                <span className="field-label-main">{field.label}</span>
                                <span className="field-type-pill">{field.type.toUpperCase()}</span>
                                {field.options && field.options.length > 0 && (
                                    <span className="field-options-pill">
                                        Options: {field.options.slice(0, 3).join(', ')}{field.options.length > 3 ? '...' : ''}
                                    </span>
                                )}
                                {field.required !== false && (
                                    <span className="field-required-pill">Obligatoire</span>
                                )}
                                {field.type === 'file' && field.fileConfig && (
                                    <span className="field-file-config-pill">
                                        Fichier: {field.fileConfig.maxSizeMB}MB max
                                    </span>
                                )}
                            </div>
                            <Button 
                                variant="outline-danger" 
                                size="sm" 
                                onClick={() => removeField(index)} 
                                className="btn-remove-field"
                            >
                                ✕
                            </Button>
                        </ListGroup.Item>
                    ))}
                    {form.fields.length === 0 && (
                        <ListGroup.Item className="text-center text-muted list-item-empty">
                            Ajoute ton premier champ ci-dessus pour commencer.
                        </ListGroup.Item>
                    )}
                </ListGroup>

                {/* Éditeur de Logique Conditionnelle */}
                <ConditionalLogicEditor form={form} setForm={setForm} />

                {/* Upload de Logo */}
                <Card className="mt-4 p-3 animated-card-small logo-card">
                    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2">
                        <h6 className="mb-1 mb-md-0">Logo de l&apos;Entreprise</h6>
                        <span className="logo-hint">Optionnel mais ultra recommandé</span>
                    </div>
                    <p className="text-muted small mb-2">
                        Ce logo sera affiché en haut de ton formulaire public.
                    </p>
                    <InputGroup>
                        <Form.Control type="file" onChange={handleLogoChange} accept="image/*" />
                        <Button 
                            variant="primary" 
                            onClick={handleLogoUpload} 
                            disabled={!logoFile || !form._id} 
                            className="btn-upload-logo"
                        >
                            Uploader le Logo
                        </Button>
                    </InputGroup>
                    {uploadError && <Alert variant="warning" className="mt-2">{uploadError}</Alert>}
                    {/* ⚠️ CORRECTION CRITIQUE LOGO : Ajout du préfixe data URI pour l'affichage */}
                    {form.logoBase64 && ( 
                        <p className="mt-2 text-success d-flex align-items-center flex-wrap gap-2">
                            <span>Logo actuel:</span> 
                            <img 
                                // 💡 Modification: Le backend fournit la chaîne Base64 brute, on ajoute le préfixe
                                src={`data:image/png;base64,${form.logoBase64.replace(/^data:image\/\w+;base64,/, '')}`} 
                                alt="Logo Aperçu" 
                                className="logo-preview"
                                style={{ maxHeight: '50px' }}
                            />
                        </p>
                    )}
                </Card>
            </Card.Body>
        </Card>
    );
};

// --- PARTIE 3 : DASHBOARD (Inchangé) ---
const Dashboard = ({ user, token, apiUrl }) => {
    const [forms, setForms] = useState([]);
    const [currentView, setCurrentView] = useState('list'); 
    const [selectedForm, setSelectedForm] = useState(null);
    const [currentFormDetails, setCurrentFormDetails] = useState({ 
        title: '', 
        fields: [], 
        logoBase64: '', 
        publicUrl: '', 
        status: 'draft' 
    }); 
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [qrCodeDataURL, setQrCodeDataURL] = useState('');
    const [isNewForm, setIsNewForm] = useState(true);
    // NOUVEAUX ÉTATS POUR LA MODALE DE DÉTAILS
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    // 💡 Ajout pour stocker les détails du formulaire pour la modale
    const [formForModal, setFormForModal] = useState(null);


    const fetchForms = useCallback(async () => {
        try {
            const response = await axios.get(`${apiUrl}/forms`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setForms(response.data);
            setError('');
        } catch (err) {
            setError('Erreur lors de la récupération des formulaires.');
        }
    }, [apiUrl, token]);

    useEffect(() => {
        fetchForms();
    }, [fetchForms]);

    const handleNewForm = () => {
        setIsNewForm(true);
        setSelectedForm(null);
        setCurrentFormDetails({ title: '', fields: [], logoBase64: '', publicUrl: '', status: 'draft' }); 
        setQrCodeDataURL('');
        setCurrentView('builder');
    };

    const handleEditForm = (form) => {
        setIsNewForm(false);
        setSelectedForm(form);
        const formToEdit = forms.find(f => f._id === form._id);
        
        setCurrentFormDetails({ 
            ...formToEdit, 
            fields: formToEdit?.fields || [], 
            status: formToEdit?.status || 'draft', 
            publicUrl: '' 
        }); 
        
        setQrCodeDataURL('');
        setCurrentView('builder');
    };

    const handleSaveForm = async () => {
        setSuccessMessage('');
        setError('');
        try {
            const dataToSave = { 
                title: currentFormDetails.title, 
                fields: currentFormDetails.fields,
                status: currentFormDetails.status, 
                ...(currentFormDetails._id && { _id: currentFormDetails._id }) 
            };
            
            let response;
            let verb = 'post';
            let url = `${apiUrl}/forms`;

            if (currentFormDetails._id) {
                verb = 'put';
                url = `${apiUrl}/forms/${currentFormDetails._id}`;
                response = await axios.put(url, dataToSave, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                response = await axios.post(url, dataToSave, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }

            const savedForm = response.data;
            
            let frontendBaseUrl = window.location.origin;

            if (frontendBaseUrl.includes('localhost')) {
                frontendBaseUrl = 'https://startup-form.onrender.com'; 
            }

            const generatedPublicUrl = `${frontendBaseUrl}/form/${savedForm.token}`; 

            setSelectedForm(savedForm);
            setIsNewForm(false);
            
            setSuccessMessage('Formulaire sauvegardé et lien public généré !');
            
            setCurrentFormDetails(prevDetails => ({
                ...prevDetails,
                _id: savedForm._id, 
                token: savedForm.token, 
                publicUrl: generatedPublicUrl,
                logoBase64: savedForm.logoBase64, 
                status: savedForm.status || 'draft' 
            }));

            fetchForms();

        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la sauvegarde du formulaire.');
        }
    };

    const handleViewStats = async (formId) => {
        setError('');
        try {
            const formDetailResponse = await axios.get(`${apiUrl}/forms/${formId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const formDetails = formDetailResponse.data;

            const statsData = {
                _id: formDetails._id,
                title: formDetails.title,
                submissions: formDetails.submissions, 
                submissionCount: formDetails.submissions.length,
                views: 0, 
                conversionRate: formDetails.submissions.length > 0 ? 100 : 0
            };
            
            setStats(statsData);
            setFormForModal(formDetails); // Stocker les détails du formulaire pour la modale
            setCurrentView('stats');
        } catch (err) {
            setError('Erreur lors de la récupération des statistiques.');
        }
    };
    
    // FONCTIONS DE GESTION DE MODALE
    const handleShowDetails = (submission) => {
        setSelectedSubmission(submission);
        setShowDetailsModal(true);
    };

    const handleCloseDetails = () => {
        setShowDetailsModal(false);
        setSelectedSubmission(null);
    };
    
    // FONCTION D'EXPORTATION (MISE À JOUR pour le backend CSV/PDF)
    const handleExport = async (format) => {
        setError('');
        if (!stats) return; 

        try {
            const formId = stats._id; 
            const queryFormat = format === 'excel' ? 'csv' : format; 
            const fileName = `${stats.title}_export_${new Date().toISOString().slice(0, 10)}.${queryFormat}`;
            
            const response = await axios.get(`${apiUrl}/forms/${formId}/export?format=${queryFormat}`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob', 
            });
            
            // Si le backend renvoie un message d'erreur (format JSON) au lieu du blob (pour le PDF 501), on le gère
            if (response.headers['content-type'] && response.headers['content-type'].includes('application/json')) {
                 const reader = new FileReader();
                 reader.onload = function() {
                    try {
                        const errorData = JSON.parse(reader.result);
                        setError(errorData.message || `Erreur JSON lors de l'exportation vers ${format}.`);
                    } catch (e) {
                         setError(`Erreur lors de la lecture du message d'erreur pour ${format}.`);
                    }
                 }
                 reader.readAsText(response.data);
                 return;
            }

            // Créer un lien temporaire pour télécharger le fichier (pour CSV)
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            alert(`Exportation réussie en format ${queryFormat.toUpperCase()}! Le téléchargement a commencé.`);

        } catch (err) {
            // Cette erreur gère les codes HTTP 4xx/5xx qui ne sont pas gérés par le bloc ci-dessus
            setError(err.response?.data?.message || `Erreur lors de l'exportation vers ${format}. (Vérifiez le backend)`);
        }
    };


    const renderContent = () => {
        if (successMessage) {
            setTimeout(() => setSuccessMessage(''), 5000);
        }
        
        if (currentView === 'builder') {
            const publicUrl = currentFormDetails.publicUrl || '';
            
            return (
                <>
                    {successMessage && <Alert variant="success" className="animated-alert">{successMessage}</Alert>}
                    {publicUrl && (
                        <Card className="mb-4 p-3 text-center animated-card-small link-card">
                            <h5>🔗 Lien Public &amp; QR Code</h5>
                            <p className="text-muted small mb-3">
                                Partage ce lien à ton audience ou imprime le QR code sur tes affiches.
                            </p>
                            <Row className="align-items-center justify-content-center g-3">
                                <Col xs="auto">
                                    <div className="qr-wrapper">
                                        {/* On utilise la librairie directement ici */}
                                        <QRCodeSVG value={publicUrl} size={128} level="H" includeMargin={true} />
                                    </div>
                                </Col>
                                <Col xs={12} md={6} className="text-start">
                                    <p className="mt-2 mb-0">
                                        <small className="text-muted">URL d&apos;accès au formulaire :</small><br/>
                                        <a 
                                            href={publicUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="text-primary-custom public-url-link"
                                        >
                                            {publicUrl}
                                        </a>
                                    </p>
                                </Col>
                                <Col xs={12} md={3} className="d-grid">
                                    {/* Simplification du téléchargement du QR Code */}
                                    <Button 
                                        variant="outline-primary" 
                                        className="mt-2 btn-qr-download" 
                                        onClick={() => {
                                            const svgElement = document.querySelector('.qr-wrapper svg');
                                            const canvas = document.createElement('canvas');
                                            canvas.width = 128;
                                            canvas.height = 128;
                                            const ctx = canvas.getContext('2d');
                                            const img = new Image();
                                            const svgData = new XMLSerializer().serializeToString(svgElement);
                                            
                                            img.onload = function() {
                                                ctx.drawImage(img, 0, 0);
                                                const pngFile = canvas.toDataURL("image/png");
                                                const downloadLink = document.createElement('a');
                                                downloadLink.href = pngFile;
                                                downloadLink.download = `formulaire_${currentFormDetails.token}_qr.png`;
                                                document.body.appendChild(downloadLink);
                                                downloadLink.click();
                                                document.body.removeChild(downloadLink);
                                            };
                                            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                                        }}
                                    >
                                        Télécharger QR
                                    </Button>
                                </Col>
                            </Row>
                        </Card>
                    )}
                    <FormBuilder 
                        form={currentFormDetails} 
                        setForm={setCurrentFormDetails} 
                        onSave={handleSaveForm}
                        onUploadLogo={fetchForms}
                        token={token}
                        apiUrl={apiUrl}
                    />
                </>
            );
        }

        if (currentView === 'stats' && stats) {
            const hasSubmissions = stats.submissions && stats.submissions.length > 0;
            
            const submissionKeys = hasSubmissions 
                ? stats.submissions.reduce((keys, sub) => {
                    if (sub.data && Array.isArray(sub.data)) {
                        const currentKeys = sub.data.map(d => d.fieldId);
                         return [...new Set([...keys, ...currentKeys])];
                    }
                    return keys;
                }, [])
                : [];
            
            return (
                <>
                <Card className="mb-4 stats-card animated-card">
                    <Card.Header className="d-flex flex-column flex-md-row justify-content-between align-items-md-center card-header-stats">
                        <div className="mb-2 mb-md-0">
                            <h5 className="mb-0">📊 Statistiques</h5>
                            <small className="text-muted-light d-block">Formulaire : {stats.title}</small>
                        </div>
                        {/* Boutons d'exportation */}
                        <div className="d-flex gap-2">
                             <Button variant="success" onClick={() => handleExport('excel')} size="sm">
                                Export Excel
                            </Button>
                             <Button variant="danger" onClick={() => handleExport('pdf')} size="sm">
                                Export PDF
                            </Button>
                            <Button variant="light" onClick={() => setCurrentView('list')} className="btn-save-custom">
                                Retour à la liste
                            </Button>
                        </div>
                    </Card.Header>
                    <Card.Body>
                        <Row className="text-center mb-4 stats-kpi-row">
                            <Col md={4} xs={12} className="mb-3 mb-md-0">
                                <Card className="p-3 stat-kpi">
                                    <span className="stat-label">Vues Totales</span>
                                    {/* Vues non implémentées */}
                                    <h4>1</h4> 
                                </Card>
                            </Col>
                            <Col md={4} xs={12} className="mb-3 mb-md-0">
                                <Card className="p-3 stat-kpi">
                                    <span className="stat-label">Soumissions</span>
                                    <h4>{stats.submissionCount}</h4>
                                </Card>
                            </Col>
                            <Col md={4} xs={12}>
                                <Card className="p-3 stat-kpi conversion-rate-card">
                                    <span className="stat-label">Taux de Conversion</span>
                                     {/* Taux de conversion basé sur Soumissions / 1 Vue */}
                                    <h4 className="text-primary-custom">{stats.conversionRate}%</h4>
                                </Card>
                            </Col>
                        </Row>
                        
                        <h5 className="mt-4 mb-3 section-title-with-pill">
                            Détails des Soumissions 
                            <span className="section-pill">{stats.submissionCount}</span>
                        </h5>
                        
                        {stats.submissions.length === 0 ? (
                            <Alert variant="info" className="mt-3">
                                Aucune soumission pour ce formulaire pour l&apos;instant.
                            </Alert>
                        ) : (
                            <div className="table-responsive submissions-table-wrapper">
                                <table className="table table-striped table-hover submissions-table">
                                    <thead className="thead-dark-custom">
                                        <tr>
                                            <th>#</th>
                                            <th>Date</th>
                                            {/* MODIFICATION : Une seule colonne pour les détails */}
                                            <th>Détails de la Soumission</th> 
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.submissions.map((sub, index) => (
                                            <tr key={index}>
                                                <td>{index + 1}</td>
                                                <td>{new Date(sub.submittedAt).toLocaleDateString()}</td>
                                                {/* AJOUT : Bouton Voir Détails */}
                                                <td>
                                                    <Button 
                                                        variant="outline-info" 
                                                        size="sm"
                                                        onClick={() => handleShowDetails(sub)}
                                                    >
                                                        Voir détails ({submissionKeys.length} champs)
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card.Body>
                </Card>
                {/* 💡 MODIFICATION : Passage de formForModal aux détails */}
                <SubmissionDetailsModal
                    show={showDetailsModal}
                    handleClose={handleCloseDetails}
                    submission={selectedSubmission}
                    formDetails={formForModal}
                />
                </>
            );
        }

        // Vue Liste des formulaires
        return (
            <Card className="animated-card list-card">
                <Card.Header className="d-flex flex-column flex-md-row justify-content-between align-items-md-center card-header-list">
                    <div className="mb-2 mb-md-0">
                        <h5 className="mb-0">📋 Vos Formulaires</h5>
                        <small className="text-muted">
                            Gère, édite et analyse tous tes formulaires en un coup d&apos;œil.
                        </small>
                    </div>
                    <Button 
                        variant="primary" 
                        onClick={handleNewForm} 
                        className="btn-primary-custom"
                    >
                        + Nouveau Formulaire
                    </Button>
                </Card.Header>
                <Card.Body>
                    <ListGroup className="list-group-custom">
                        {forms.map((form) => (
                            <ListGroup.Item 
                                key={form._id} 
                                className="d-flex flex-column flex-md-row justify-content-between align-items-md-center list-item-form-summary"
                            >
                                <div className="mb-2 mb-md-0 me-md-3">
                                    <h6 className="mb-1 text-primary-custom">{form.title}</h6>
                                    <small className="text-muted d-block">
                                        Créé le: {new Date(form.createdAt).toLocaleDateString()}
                                    </small>
                                    <small className="text-muted-light">
                                        {/* Correction : Utilise .submissions.length car le backend ne l'exclut plus */}
                                        {form.submissions ? form.submissions.length : 0} réponses enregistrées
                                    </small>
                                    <span className={`status-pill status-${form.status}`}>{form.status === 'published' ? 'PUBLIÉ' : 'BROUILLON'}</span>
                                </div>
                                <div className="btn-group-form-actions">
                                    <Button 
                                        variant="outline-info" 
                                        size="sm" 
                                        className="me-2 btn-edit-form" 
                                        onClick={() => handleEditForm(form)}
                                    >
                                        Éditer
                                    </Button>
                                    <Button 
                                        variant="outline-success" 
                                        size="sm" 
                                        className="btn-stats-form" 
                                        onClick={() => handleViewStats(form._id)}
                                    >
                                        Stats
                                    </Button>
                                </div>
                            </ListGroup.Item>
                        ))}
                        {forms.length === 0 && (
                            <Alert variant="info" className="text-center mt-3 empty-forms-alert">
                                Tu n&apos;as pas encore créé de formulaires.  
                                Clique sur &quot;Nouveau Formulaire&quot; pour démarrer.
                            </Alert>
                        )}
                    </ListGroup>
                </Card.Body>
            </Card>
        );
    };

    return (
        <div className="dashboard-shell">
            <div className="dashboard-gradient" />
            <div className="dashboard">
                {error && <Alert variant="danger" className="animated-alert">{error}</Alert>}
                {renderContent()}
            </div>
        </div>
    );
};

// --- PARTIE 4 : PAGE PUBLIQUE DE FORMULAIRE (Corrigé) ---
const PublicFormPage = ({ match, apiUrl }) => {
    const [formDetails, setFormDetails] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitStatus, setSubmitStatus] = useState({ message: '', variant: '' });
    const urlToken = match.params.token;
    // 💡 Références pour la signature
    const sigPad = useRef({});

    useEffect(() => {
        const fetchForm = async () => {
            try {
                const response = await axios.get(`${apiUrl}/public/form/${urlToken}`);
                setFormDetails(response.data);

                // Initialisation des données de formulaire
                const initialData = response.data.fields.reduce((acc, field) => {
                    const key = field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'); 
                    
                    if (field.type === 'checkbox' && field.options && field.options.length > 0) {
                        field.options.forEach(option => {
                            const optionKey = `${key}_${option.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                            acc[optionKey] = false;
                        });
                    } else if (field.type === 'checkbox') {
                        acc[key] = false;
                    } else if (field.type === 'file') {
                         // On stocke la Data URL du fichier
                        acc[key] = null;
                    } else if (field.type === 'signature') {
                         // On stocke la Data URL de la signature
                        acc[key] = null; 
                    } else if (field.type === 'select') {
                        acc[key] = '';
                    } else {
                        // Texte, email, number, radio, date
                        acc[key] = '';
                    }
                    return acc;
                }, {});
                setFormData(initialData);
            } catch (error) {
                setSubmitStatus({
                    message: 'Formulaire non trouvé ou lien invalide.',
                    variant: 'error',
                });
            } finally {
                setLoading(false);
            }
        };
        fetchForm();
    }, [urlToken, apiUrl]);

    // LOGIQUE DE VISIBILITÉ (Inchangée)
    const isFieldVisible = useCallback((fieldToCheck) => {
        const fieldTargetId = fieldToCheck.label.toLowerCase().replace(/[^a-z0-9]/g, '_');

        const targetingFields = formDetails.fields.filter(f => 
            (f.conditionalLogic || []).some(logic => logic.showFieldId === fieldTargetId)
        );

        if (targetingFields.length === 0) {
            return true; 
        }

        return targetingFields.some(triggerField => {
            const triggerKey = triggerField.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
            
            return (triggerField.conditionalLogic || []).some(logic => {
                const requiredValue = logic.value;
                
                if (['radio', 'select'].includes(triggerField.type)) {
                    return formData[triggerKey] === requiredValue;
                }
                return false;
            });
        });

    }, [formDetails, formData]);


    const handleChange = (key, e, type) => {
        let value;

        if (type === 'checkbox') {
            value = e.target.checked;
        } else if (type === 'file') {
             // 💡 Lecture du fichier et stockage de la Base64 (pour le backend)
             const file = e.target.files[0];
             if (file) {
                 const reader = new FileReader();
                 reader.onloadend = () => {
                     setFormData(prev => ({ ...prev, [key]: reader.result }));
                 };
                 reader.readAsDataURL(file);
                 return; // Retour immédiat car la mise à jour est asynchrone
             }
             value = null; // Si aucun fichier sélectionné

        } else if (type === 'signature') {
             // 💡 Géré par la fonction de soumission pour la référence (sigPad)
             return; 

        } else {
            value = e.target.value;
        }

        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
    
        if (!formDetails) {
            setSubmitStatus({
                message: '❌ Formulaire introuvable.',
                variant: 'error',
            });
            return;
        }
    
        setSubmitStatus({ message: 'Envoi en cours...', variant: 'info' });
    
        const dataToSubmitArray = [];
        const missingRequiredLabels = [];
        
        // 💡 Booléen pour les fichiers (on ne bloque plus l'envoi, on envoie la Base64)
        let hasFilesOrSignatures = false; 
    
        for (const field of formDetails.fields) {
            
            if (!isFieldVisible(field)) {
                continue;
            }
    
            if (!field._id) {
                console.warn('Champ sans _id, ignoré :', field);
                continue;
            }
    
            const fieldKey = field.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const isRequired = field.required !== false;
            let value;
    
            // 1️⃣ Checkbox multiple (avec options)
            if (field.type === 'checkbox' && field.options && field.options.length > 0) {
                const checkedOptions = field.options.filter((option) => {
                    const optionKey = `${fieldKey}_${option.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                    return formData[optionKey] === true;
                });
    
                if (isRequired && checkedOptions.length === 0) {
                    missingRequiredLabels.push(field.label);
                    continue;
                }
    
                if (checkedOptions.length > 0) {
                    dataToSubmitArray.push({
                        fieldId: String(field._id),
                        value: checkedOptions, // tableau de strings
                    });
                }
                continue; 
            }

            // 2️⃣ Case à cocher simple
            if (field.type === 'checkbox' && (!field.options || field.options.length === 0)) {
                const isChecked = formData[fieldKey] === true;
    
                if (isRequired && !isChecked) {
                    missingRequiredLabels.push(field.label);
                    continue;
                }
                
                dataToSubmitArray.push({
                    fieldId: String(field._id),
                    // 💡 CORRECTION : Convertir le booléen en String pour plus de compatibilité avec le schéma [String]
                    value: String(isChecked), 
                });
                continue;
            }
    
            // 3️⃣ Fichiers (Upload)
            if (field.type === 'file') {
                value = formData[fieldKey]; // C'est la Base64
    
                if (isRequired && !value) {
                    missingRequiredLabels.push(field.label);
                    continue;
                }
                
                if (value) {
                    hasFilesOrSignatures = true;
                    dataToSubmitArray.push({
                        fieldId: String(field._id),
                        value,
                    });
                }
                continue;
            }
            
            // 4️⃣ Signature
            if (field.type === 'signature') {
                 // Récupérer la signature du pad si elle est requise ou dessinée
                const signaturePadRef = sigPad.current[field._id];
                if (signaturePadRef && !signaturePadRef.isEmpty()) {
                    value = signaturePadRef.toDataURL(); // Récupère l'image en Base64
                    hasFilesOrSignatures = true;
                } else if (signaturePadRef && signaturePadRef.isEmpty()) {
                    value = null;
                }

                if (isRequired && !value) {
                    missingRequiredLabels.push(field.label);
                    continue;
                }

                if (value) {
                     dataToSubmitArray.push({
                        fieldId: String(field._id),
                        value,
                    });
                }
                continue;
            }

            // 5️⃣ Tous les autres types (text, email, number, radio, select, date)
            const rawValue = formData[fieldKey] ?? '';
            value =
                typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    
            if (isRequired && (value === '' || value === null || value === undefined)) {
                missingRequiredLabels.push(field.label);
                continue;
            }
    
            // Si non requis et vide → on n’envoie rien (sauf pour les numéros/dates)
            if ((value === '' || value === null || value === undefined) && value !== 0) {
                continue;
            }
            
            // Si c'est une valeur simple, on l'envoie comme une chaîne unique
            dataToSubmitArray.push({
                fieldId: String(field._id),
                // 💡 Conversion en chaîne unique pour les champs qui n'ont pas renvoyé un tableau
                value: String(value), 
            });
        }
    
        // 6️⃣ Validation finale
        if (missingRequiredLabels.length > 0) {
            setSubmitStatus({
                message:
                    '❌ Veuillez remplir tous les champs requis : ' +
                    missingRequiredLabels.join(', '),
                variant: 'error',
            });
            console.error('Champs requis manquants (frontend):', missingRequiredLabels);
            return;
        }
    
        if (dataToSubmitArray.length === 0) {
            setSubmitStatus({
                message: '❌ Soumission invalide : le formulaire est vide.',
                variant: 'error',
            });
            return;
        }
    
        // 7️⃣ ENVOI
        console.log('Payload ARRAY envoyé au backend :', dataToSubmitArray);

        try {
            const response = await axios.post(
                `${apiUrl}/public/form/${urlToken}/submit`,
                { data: dataToSubmitArray }, 
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
    
            setSubmitStatus({
                message: '✅ Merci ! Votre réponse a bien été enregistrée.',
                variant: 'success',
            });
    
            // Réinitialisation après succès
            const resetData = formDetails.fields.reduce((acc, field) => {
                const key = field.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
                if (field.type === 'checkbox' && field.options && field.options.length > 0) {
                    field.options.forEach((option) => {
                        const optionKey = `${key}_${option.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                        acc[optionKey] = false;
                    });
                } else if (field.type === 'checkbox') {
                    acc[key] = false;
                } else if (field.type === 'file' || field.type === 'signature') {
                    acc[key] = null;
                } else if (field.type === 'select') {
                    acc[key] = '';
                } else {
                    acc[key] = '';
                }
    
                return acc;
            }, {});
    
            setFormData(resetData);
            // Réinitialiser les pads de signature
            Object.values(sigPad.current).forEach(pad => pad && pad.clear()); 
            
            // Redirection éventuelle
            if (response.data.redirect && response.data.redirectUrl) {
                window.location.href = response.data.redirectUrl;
                return;
            }


        } catch (error) {
            console.error('Erreur de soumission (détail backend) :', error.response?.data || error);
            setSubmitStatus({
                message:
                    error.response?.data?.message ||
                    '❌ Erreur lors de la soumission. Vérifiez les champs.',
                variant: 'error',
            });
        }
    };
    

    // Loader simple
    if (loading) {
        return (
            <div className="pf-bg">
                <div className="pf-loader">
                    <div className="pf-loader-dot" />
                    <span>Chargement du formulaire...</span>
                </div>
            </div>
        );
    }

    // Form introuvable
    if (!formDetails) {
        return (
            <div className="pf-bg">
                <div className="pf-card pf-card--error">
                    <h2 className="pf-title">Oups…</h2>
                    <p className="pf-text">
                        {submitStatus.message || 'Formulaire non trouvé ou non publié.'}
                    </p>
                </div>
            </div>
        );
    }

    // Fonction utilitaire pour générer l'attribut accept pour le champ file
    const getFileAccept = (allowedTypes) => {
        let accepts = [];
        if (allowedTypes.includes('image')) accepts.push('image/*');
        if (allowedTypes.includes('document')) accepts.push('.pdf,.doc,.docx,.xlsx,.xls,.txt');
        if (allowedTypes.includes('other')) accepts.push('*');
        return accepts.join(',');
    };

    return (
        <div className="pf-bg">
            <div className="pf-card">
                {/* HEADER */}
                <div className="pf-header">
                    {/* ⚠️ CORRECTION CRITIQUE LOGO : Ajout du préfixe data URI pour l'affichage */}
                    {formDetails.logoBase64 && (
                        <div className="pf-logo-wrapper">
                            <img
                                src={`data:image/png;base64,${formDetails.logoBase64.replace(/^data:image\/\w+;base64,/, '')}`} 
                                alt="Logo entreprise"
                                className="pf-logo"
                                style={{ maxHeight: '50px' }}
                            />
                        </div>
                    )}
                    <h1 className="pf-form-title">{formDetails.title}</h1>
                    <p className="pf-subtitle">
                        Merci de prendre quelques instants pour répondre 🙏
                    </p>
                </div>

                {/* BODY */}
                <div className="pf-body">
                    {submitStatus.message && (
                        <div
                            className={
                                'pf-status ' +
                                (submitStatus.variant === 'success'
                                    ? 'pf-status--success'
                                    : submitStatus.variant === 'error'
                                    ? 'pf-status--error'
                                    : 'pf-status--info')
                            }
                        >
                            {submitStatus.message}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="pf-form">
                        {formDetails.fields.map((field, index) => {
                            if (!isFieldVisible(field)) {
                                return null; 
                            }
                            
                            const key = field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'); 
                            const isRequired = field.required !== false; 
                            const fieldId = `field-${index}`;
                            
                            let inputElement;

                            switch (field.type) {
                                case 'textarea':
                                case 'email':
                                case 'number':
                                case 'text':
                                    inputElement = (
                                        <input
                                            className="pf-input"
                                            type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                                            value={formData[key] || ''}
                                            onChange={(e) => handleChange(key, e, 'text')}
                                            required={isRequired}
                                        />
                                    );
                                    break;
                                    
                                case 'date':
                                    // 💡 NOUVEAU : Champ date
                                    inputElement = (
                                        <input
                                            className="pf-input"
                                            type="date"
                                            value={formData[key] || ''}
                                            onChange={(e) => handleChange(key, e, 'text')}
                                            required={isRequired}
                                        />
                                    );
                                    break;

                                case 'file':
                                    const acceptTypes = field.fileConfig ? getFileAccept(field.fileConfig.allowedTypes) : '*';
                                    inputElement = (
                                        <>
                                            <input
                                                type="file"
                                                className="pf-input pf-input--file"
                                                // La gestion des changements est asynchrone pour la Base64
                                                onChange={(e) => handleChange(key, e, 'file')} 
                                                required={isRequired && !formData[key]} // Requis seulement si pas déjà de data
                                                accept={acceptTypes}
                                            />
                                            {/* 💡 Affichage du nom du fichier stocké (Base64) ou un indicateur */}
                                            {formData[key] && (
                                                <small className="text-success mt-1 d-block">
                                                    ✅ Fichier sélectionné (Prêt pour l'envoi en Base64).
                                                </small>
                                            )}
                                        </>
                                    );
                                    break;
                                    
                                case 'signature':
                                    // 💡 NOUVEAU : Signature Pad
                                    inputElement = (
                                        <div className="pf-signature-pad-container">
                                            <SignaturePad
                                                ref={(ref) => sigPad.current[field._id] = ref}
                                                canvasProps={{
                                                    width: 400, 
                                                    height: 200, 
                                                    className: 'signature-pad-canvas'
                                                }}
                                                // Pas de onChange direct, la valeur est lue dans handleSubmit
                                            />
                                            <div className="pf-signature-actions">
                                                <button 
                                                    type="button" 
                                                    onClick={() => sigPad.current[field._id].clear()}
                                                    className="pf-signature-clear-btn"
                                                >
                                                    Effacer
                                                </button>
                                                {isRequired && !sigPad.current[field._id]?.isEmpty() && (
                                                     <small className="text-success ms-2">Signature Capturée.</small>
                                                )}
                                            </div>
                                        </div>
                                    );
                                    break;


                                case 'select':
                                    if (field.options && field.options.length > 0) {
                                        inputElement = (
                                            <select
                                                className="pf-input pf-input--select"
                                                value={formData[key] || ''}
                                                onChange={(e) => handleChange(key, e, 'text')}
                                                required={isRequired}
                                            >
                                                <option value="" disabled>Sélectionner une option</option>
                                                {field.options.map((option, optIndex) => (
                                                    <option key={optIndex} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        );
                                    } else {
                                        inputElement = <p className="text-danger small">Erreur: Aucune option configurée.</p>;
                                    }
                                    break;

                                case 'radio':
                                    if (field.options && field.options.length > 0) {
                                        inputElement = (
                                            <div className="pf-radio-group">
                                                {field.options.map((option, optIndex) => (
                                                    <label key={optIndex} className="pf-radio-label">
                                                        <input
                                                            type="radio"
                                                            name={key}
                                                            value={option}
                                                            checked={formData[key] === option}
                                                            onChange={(e) => handleChange(key, e, 'text')}
                                                            required={isRequired}
                                                        />
                                                        {option}
                                                    </label>
                                                ))}
                                            </div>
                                        );
                                    } else {
                                        inputElement = <p className="text-danger small">Erreur: Aucune option configurée.</p>;
                                    }
                                    break;
                                
                                case 'checkbox':
                                    // Gérer les cases à cocher multiples
                                    if (field.options && field.options.length > 0) {
                                         inputElement = (
                                            <div className="pf-checkbox-group">
                                                {field.options.map((option, optIndex) => {
                                                    const optionKey = `${key}_${option.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                                                    return (
                                                        <label key={optIndex} className="pf-checkbox-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={!!formData[optionKey]}
                                                                onChange={(e) => handleChange(optionKey, e, 'checkbox')}
                                                            />
                                                            {option}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        );
                                    } else {
                                        // Case à cocher simple
                                        inputElement = (
                                            <label className="pf-field pf-field--checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={!!formData[key]}
                                                    onChange={(e) => handleChange(key, e, 'checkbox')}
                                                    className="pf-checkbox"
                                                    required={isRequired}
                                                />
                                                <span className="pf-checkbox-label">
                                                    {field.label}
                                                    {isRequired && <span className="pf-required">*</span>}
                                                </span>
                                            </label>
                                        );
                                    }
                                    break;

                                default: 
                                    inputElement = (
                                        <input
                                            className="pf-input"
                                            type={field.type}
                                            value={formData[key] || ''}
                                            onChange={(e) => handleChange(key, e, 'text')}
                                            required={isRequired}
                                        />
                                    );
                            }

                            return (
                                <div className="pf-field" key={index} id={fieldId}>
                                    {/* On affiche le label seulement si ce n'est pas une case à cocher simple ou une signature */}
                                    {field.type !== 'checkbox' || (field.type === 'checkbox' && field.options && field.options.length > 0) ? (
                                        <label className="pf-label">
                                            {field.label}
                                            {isRequired && <span className="pf-required">*</span>}
                                        </label>
                                    ) : null}
                                    
                                    {inputElement}
                                </div>
                            );
                        })}

                        <button type="submit" className="pf-submit">
                            Soumettre le formulaire
                        </button>
                    </form>
                </div>

                {/* FOOTER */}
                <div className="pf-footer">
                    Propulsé par <span className="pf-brand">FormGen Pro</span>
                </div>
            </div>
        </div>
    );
};



// --- PARTIE 5 : APP PRINCIPALE (Inchangé) ---
const App = () => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [loading, setLoading] = useState(true);
    const [path, setPath] = useState(window.location.pathname);
    const [theme, setTheme] = useState(() => {
        const stored = localStorage.getItem(THEME_KEY);
        return stored === 'dark' || stored === 'light' ? stored : 'light';
    });
    
    // Gestion du thème global
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };
    
    // "Routing" simple
    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const navigate = (newPath) => {
        window.history.pushState({}, '', newPath);
        setPath(newPath);
    };

    // Vérification du token
    useEffect(() => {
        const verifyUser = async () => {
            if (token) {
                try {
                    const response = await axios.get(`${API_URL}/auth/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    // NOTE : La structure de l'objet utilisateur est différente ici, mais c'est acceptable
                    setUser(response.data); 
                } catch (error) {
                    console.error("Token non valide ou expiré.");
                    handleLogout(false);
                }
            }
            setLoading(false);
        };
        verifyUser();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const handleAuth = (tokenData, userData) => {
        localStorage.setItem('token', tokenData);
        setToken(tokenData);
        setUser(userData);
        navigate('/dashboard');
    };

    const handleLogout = (reload = true) => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        navigate('/');
        if (reload) window.location.reload();
    };

    if (loading) {
        return <Loader />;
    }

    const renderRoute = () => {
        if (path.startsWith('/form/')) {
            const tokenMatch = path.match(/\/form\/(.+)$/); 
            if (tokenMatch && tokenMatch[1]) {
                return <PublicFormPage match={{ params: { token: tokenMatch[1] }} } apiUrl={API_URL} />;
            }
        }
        
        if (path === '/auth') {
            if (user) {
                navigate('/dashboard');
                return null;
            }
            return <Auth onAuthSuccess={handleAuth} apiUrl={API_URL} navigate={navigate} />;
        }

        if (user && path === '/dashboard') {
            return <Dashboard user={user} token={token} apiUrl={API_URL} />;
        }
        
        if (path === '/') {
            if (user) {
                navigate('/dashboard');
                return null; 
            }
            return <WelcomePage navigate={navigate} />;
        }

        return (
            <div className="text-center mt-5 not-found-page">
                <h2>404</h2>
                <p>Page introuvable.</p>
                <Button variant="link" onClick={() => navigate('/')}>
                    ← Retour à l&apos;accueil
                </Button>
            </div>
        );
    };

    const showNavbar = user && path === '/dashboard';

    return (
        <div className="app-shell">
            {/* Bouton de thème global */}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

            {showNavbar && (
                <Navbar expand="lg" className="mb-4 navbar-custom">
                    <Container>
                        <Navbar.Brand 
                            onClick={() => navigate('/dashboard')} 
                            style={{ cursor: 'pointer' }}
                            className="navbar-brand-logo"
                        >
                            <span className="brand-icon">📝</span> FormGen Pro
                        </Navbar.Brand>
                        <Navbar.Toggle aria-controls="basic-navbar-nav" />
                        <Navbar.Collapse id="basic-navbar-nav">
                            <Nav className="ms-auto align-items-center">
                                {/* MODIFICATION : Disposition améliorée */}
                                <div className="d-flex align-items-center me-3 navbar-welcome">
                                    <span className="navbar-chip me-2">Entreprise</span>
                                    <span className="navbar-company">{user.companyName}</span>
                                </div>
                                <Button 
                                    variant="outline-light" 
                                    onClick={() => handleLogout(true)} 
                                    className="btn-logout-custom"
                                >
                                    Déconnexion
                                </Button>
                            </Nav>
                        </Navbar.Collapse>
                    </Container>
                </Navbar>
            )}

            <Container 
                fluid={!showNavbar} 
                className={showNavbar ? 'app-container-dashboard' : 'app-container-public'}
            >
                {renderRoute()}
            </Container>
        </div>
    );
};

export default App;