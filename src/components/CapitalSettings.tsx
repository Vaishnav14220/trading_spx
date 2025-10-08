import React, { useState, useEffect } from 'react';
import { Settings, Save, Eye, EyeOff } from 'lucide-react';
import { getAuthService } from '../services/capitalAuth';

interface CapitalSettingsProps {
  onCredentialsSet: () => void;
}

export const CapitalSettings: React.FC<CapitalSettingsProps> = ({ onCredentialsSet }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [apiKey, setApiKey] = useState('9bP6pGlM0Tt4q7fO');
  const [identifier, setIdentifier] = useState('vaishnav14220@gmail.com');
  const [password, setPassword] = useState('Vvn@#411037');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Check if credentials are already saved in localStorage
    const savedIdentifier = localStorage.getItem('capital_identifier');
    const savedApiKey = localStorage.getItem('capital_api_key');
    const savedPassword = localStorage.getItem('capital_password');
    
    if (savedIdentifier && savedApiKey && savedPassword) {
      setIdentifier(savedIdentifier);
      setApiKey(savedApiKey);
      setPassword(savedPassword);
      setIsSaved(true);
      
      // Auto-configure auth service
      const authService = getAuthService();
      authService.setConfig({
        apiKey: savedApiKey,
        identifier: savedIdentifier,
        password: savedPassword,
      });
    } else {
      // If no credentials saved, open settings automatically
      setIsOpen(true);
    }
  }, []);

  const handleSave = () => {
    if (!apiKey || !identifier || !password) {
      alert('Please fill in all fields');
      return;
    }

    // Save to localStorage
    localStorage.setItem('capital_api_key', apiKey);
    localStorage.setItem('capital_identifier', identifier);
    localStorage.setItem('capital_password', password);

    // Configure auth service
    const authService = getAuthService();
    authService.setConfig({
      apiKey,
      identifier,
      password,
    });

    setIsSaved(true);
    setIsOpen(false);
    onCredentialsSet();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
          isSaved 
            ? 'bg-slate-700 text-white hover:bg-slate-600' 
            : 'bg-yellow-500 text-white hover:bg-yellow-600 animate-pulse'
        }`}
      >
        <Settings className="h-4 w-4" />
        <span className="text-sm font-medium">
          {isSaved ? 'API Settings' : 'Setup Required'}
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Settings className="h-6 w-6" />
                Capital.com API Settings
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  API Key
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full px-4 py-2 bg-slate-800 text-white border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email/Username (Identifier)
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your Capital.com email"
                  className="w-full px-4 py-2 bg-slate-800 text-white border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  API Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your API password"
                    className="w-full px-4 py-2 bg-slate-800 text-white border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-300">
                <p className="font-semibold mb-1">Note:</p>
                <p>These credentials are stored locally in your browser and are used to connect to Capital.com's real-time market data API.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <Save className="h-4 w-4" />
                Save & Connect
              </button>
              {isSaved && (
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CapitalSettings;

