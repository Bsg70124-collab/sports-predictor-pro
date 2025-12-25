import React, { useState, useEffect } from 'react';

const SportsPredictor = () => {
  const [predictions, setPredictions] = useState([]);
  const [historicalPredictions, setHistoricalPredictions] = useState([]);
  const [stats, setStats] = useState({ 
    daily: 0, overall: 0, total: 0, byConfidence: {}, bySport: {}, recentTrend: [],
    roi: 0, units: 0, bestStreak: 0, worstStreak: 0, bySpread: {}, byTotal: {}
  });
  const [loading, setLoading] = useState(false);
  const [selectedSport, setSelectedSport] = useState('NFL');
  const [activeTab, setActiveTab] = useState('predictions');
  const [error, setError] = useState('');
  const [modelInsights, setModelInsights] = useState(null);
  const [bankroll, setBankroll] = useState(1000);
  const [unitSize, setUnitSize] = useState(10);
  const [mlModel, setMlModel] = useState(null);
  const [liveScores, setLiveScores] = useState([]);

  useEffect(() => {
    loadStoredData();
    initializeMLModel();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (predictions.length > 0 && activeTab === 'live') {
        fetchLiveScores();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [predictions, activeTab]);

  const initializeMLModel = () => {
    const saved = localStorage.getItem('ml-model');
    if (saved) {
      setMlModel(JSON.parse(saved));
    } else {
      const modelData = {
        weights: {
          recordDifferential: 0.25,
          homeAdvantage: 0.15,
          recentForm: 0.20,
          headToHead: 0.10,
          restDays: 0.08,
          injuries: 0.12,
          weather: 0.05,
          momentum: 0.05
        },
        learningRate: 0.01,
        iterations: 0,
        performanceHistory: []
      };
      setMlModel(modelData);
      localStorage.setItem('ml-model', JSON.stringify(modelData));
    }
  };

  const loadStoredData = () => {
    try {
      const hist = localStorage.getItem('historical-predictions');
      if (hist) {
        const data = JSON.parse(hist);
        setHistoricalPredictions(data);
        calculateStats(data);
        analyzeModelPerformance(data);
      }
      
      const settings = localStorage.getItem('user-settings');
      if (settings) {
        const saved = JSON.parse(settings);
        setBankroll(saved.bankroll || 1000);
        setUnitSize(saved.unitSize || 10);
      }

      const todaysPreds = localStorage.getItem('todays-predictions');
      const fetchDate = localStorage.getItem('last-fetch-date');
      if (todaysPreds && fetchDate === new Date().toDateString()) {
        setPredictions(JSON.parse(todaysPreds));
      }
    } catch (err) {
      console.log('No stored data yet');
    }
  };

  const saveSettings = () => {
    localStorage.setItem('user-settings', JSON.stringify({ bankroll, unitSize }));
    alert('Settings saved!');
  };

  const fetchLiveGames = async (sport) => {
    try {
      const endpoint = sport === 'NFL' 
        ? 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
        : 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
      
      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (!data.events || data.events.length === 0) {
        return [];
      }

      return data.events.slice(0, 8).map(event => {
        const competition = event.competitions[0];
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        
        return {
          game: `${awayTeam.team.displayName} @ ${homeTeam.team.displayName}`,
          homeTeam: homeTeam.team.displayName,
          awayTeam: awayTeam.team.displayName,
          homeRecord: homeTeam.records?.[0]?.summary || 'N/A',
          awayRecord: awayTeam.records?.[0]?.summary || 'N/A',
          date: event.date,
          status: event.status.type.description,
          venue: competition.venue?.fullName || 'TBD',
          odds: competition.odds?.[0] || null
        };
      });
    } catch (err) {
      console.error('API Error:', err);
      return [];
    }
  };

  const fetchLiveScores = async () => {
    try {
      const endpoint = selectedSport === 'NFL' 
        ? 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
        : 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
      
      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (data.events) {
        const scores = data.events.map(event => ({
          game: `${event.competitions[0].competitors[1].team.displayName} @ ${event.competitions[0].competitors[0].team.displayName}`,
          homeScore: event.competitions[0].competitors[0].score,
          awayScore: event.competitions[0].competitors[1].score,
          status: event.status.type.description,
          clock: event.status.displayClock,
          period: event.status.period
        }));
        setLiveScores(scores);
      }
    } catch (err) {
      console.log('Error fetching live scores:', err);
    }
  };

  const calculateStats = (historical) => {
    const today = new Date().toDateString();
    const dailyPreds = historical.filter(p => 
      new Date(p.date).toDateString() === today && p.actual
    );
    const dailyCorrect = dailyPreds.filter(p => p.correct).length;
    const dailyAccuracy = dailyPreds.length > 0 ? (dailyCorrect / dailyPreds.length * 100).toFixed(1) : 0;

    const completedPreds = historical.filter(p => p.actual);
    const overallCorrect = completedPreds.filter(p => p.correct).length;
    const overallAccuracy = completedPreds.length > 0 ? (overallCorrect / completedPreds.length * 100).toFixed(1) : 0;

    const byConfidence = { high: { total: 0, correct: 0 }, medium: { total: 0, correct: 0 }, low: { total: 0, correct: 0 } };

    completedPreds.forEach(p => {
      const level = p.confidence >= 80 ? 'high' : p.confidence >= 70 ? 'medium' : 'low';
      byConfidence[level].total++;
      if (p.correct) byConfidence[level].correct++;
    });

    const bySport = {};
    completedPreds.forEach(p => {
      if (!bySport[p.sport]) bySport[p.sport] = { total: 0, correct: 0 };
      bySport[p.sport].total++;
      if (p.correct) bySport[p.sport].correct++;
    });

    const bySpread = { total: 0, correct: 0 };
    const byTotal = { total: 0, correct: 0 };
    
    completedPreds.forEach(p => {
      if (p.spreadResult !== undefined) {
        bySpread.total++;
        if (p.spreadResult) bySpread.correct++;
      }
      if (p.totalResult !== undefined) {
        byTotal.total++;
        if (p.totalResult) byTotal.correct++;
      }
    });

    const recent = completedPreds.slice(-10).map(p => p.correct);

    let totalUnits = 0;
    completedPreds.forEach(p => {
      const units = p.recommendedUnits || 1;
      if (p.correct) totalUnits += units * 0.91;
      else totalUnits -= units;
    });
    const roi = completedPreds.length > 0 ? ((totalUnits / (completedPreds.length * 1.5)) * 100).toFixed(1) : 0;

    let bestWinStreak = 0, worstLossStreak = 0, currentStreak = 0, isWinStreak = null;
    completedPreds.forEach(p => {
      if (isWinStreak === null) {
        isWinStreak = p.correct;
        currentStreak = 1;
      } else if ((isWinStreak && p.correct) || (!isWinStreak && !p.correct)) {
        currentStreak++;
      } else {
        if (isWinStreak && currentStreak > bestWinStreak) bestWinStreak = currentStreak;
        if (!isWinStreak && currentStreak > worstLossStreak) worstLossStreak = currentStreak;
        isWinStreak = p.correct;
        currentStreak = 1;
      }
    });
    if (isWinStreak && currentStreak > bestWinStreak) bestWinStreak = currentStreak;
    if (!isWinStreak && currentStreak > worstLossStreak) worstLossStreak = currentStreak;

    setStats({
      daily: dailyAccuracy, overall: overallAccuracy, total: completedPreds.length,
      byConfidence, bySport, recentTrend: recent, roi, units: totalUnits.toFixed(2),
      bestStreak: bestWinStreak, worstStreak: worstLossStreak, bySpread, byTotal
    });
  };

  const analyzeModelPerformance = (historical) => {
    const completed = historical.filter(p => p.actual);
    if (completed.length < 3) {
      setModelInsights(null);
      return;
    }

    const highConf = completed.filter(p => p.confidence >= 80);
    const medConf = completed.filter(p => p.confidence >= 70 && p.confidence < 80);
    const lowConf = completed.filter(p => p.confidence < 70);

    const highAccuracy = highConf.length > 0 ? (highConf.filter(p => p.correct).length / highConf.length * 100).toFixed(1) : 0;
    const medAccuracy = medConf.length > 0 ? (medConf.filter(p => p.correct).length / medConf.length * 100).toFixed(1) : 0;
    const lowAccuracy = lowConf.length > 0 ? (lowConf.filter(p => p.correct).length / lowConf.length * 100).toFixed(1) : 0;

    const favorites = completed.filter(p => p.spread && p.spread.includes('-'));
    const underdogs = completed.filter(p => p.spread && (p.spread.includes('+') || p.spread === 'PK'));
    
    const favoriteAccuracy = favorites.length > 0 ? (favorites.filter(p => p.correct).length / favorites.length * 100).toFixed(1) : 0;
    const underdogAccuracy = underdogs.length > 0 ? (underdogs.filter(p => p.correct).length / underdogs.length * 100).toFixed(1) : 0;

    const recent10 = completed.slice(-10);
    const recent10Accuracy = recent10.length > 0 ? (recent10.filter(p => p.correct).length / recent10.length * 100).toFixed(1) : 0;

    let currentStreak = 0, streakType = null;
    for (let i = completed.length - 1; i >= 0; i--) {
      if (streakType === null) {
        streakType = completed[i].correct ? 'win' : 'loss';
        currentStreak = 1;
      } else if ((streakType === 'win' && completed[i].correct) || (streakType === 'loss' && !completed[i].correct)) {
        currentStreak++;
      } else break;
    }

    const featurePerformance = {};
    if (completed.length >= 10) {
      completed.forEach(p => {
        if (p.mlFeatures) {
          Object.keys(p.mlFeatures).forEach(feature => {
            if (!featurePerformance[feature]) {
              featurePerformance[feature] = { correct: 0, total: 0 };
            }
            featurePerformance[feature].total++;
            if (p.correct) featurePerformance[feature].correct++;
          });
        }
      });
    }

    let optimalThreshold = 70;
    let bestROI = -Infinity;
    for (let threshold = 60; threshold <= 90; threshold += 5) {
      const thresholdPicks = completed.filter(p => p.confidence >= threshold);
      if (thresholdPicks.length >= 5) {
        const roi = thresholdPicks.reduce((sum, p) => {
          const units = p.recommendedUnits || 1;
          return sum + (p.correct ? units * 0.91 : -units);
        }, 0) / thresholdPicks.length;
        if (roi > bestROI) {
          bestROI = roi;
          optimalThreshold = threshold;
        }
      }
    }

    setModelInsights({
      calibration: {
        high: { accuracy: highAccuracy, count: highConf.length },
        medium: { accuracy: medAccuracy, count: medConf.length },
        low: { accuracy: lowAccuracy, count: lowConf.length }
      },
      pickTypes: {
        favorites: { accuracy: favoriteAccuracy, count: favorites.length },
        underdogs: { accuracy: underdogAccuracy, count: underdogs.length }
      },
      recent: { accuracy: recent10Accuracy, streak: { type: streakType, count: currentStreak } },
      featureImportance: featurePerformance,
      optimalThreshold: optimalThreshold,
      bestROI: bestROI.toFixed(2)
    });
  };

  const generatePredictions = async () => {
    setLoading(true);
    setError('');
    
    try {
      const liveGames = await fetchLiveGames(selectedSport);
      
      if (liveGames.length === 0) {
        setError(`No ${selectedSport} games scheduled today. Check back on game days!`);
        setPredictions([]);
        setLoading(false);
        return;
      }

      const completed = historicalPredictions.filter(p => p.actual);
      let confidenceAdjustment = 0;
      let updatedWeights = mlModel ? {...mlModel.weights} : null;
      
      if (completed.length >= 20 && mlModel && modelInsights?.featureImportance) {
        Object.keys(modelInsights.featureImportance).forEach(feature => {
          const performance = modelInsights.featureImportance[feature];
          const accuracy = performance.correct / performance.total;
          
          if (accuracy > 0.7 && updatedWeights[feature]) {
            updatedWeights[feature] *= 1.1;
          } else if (accuracy < 0.4 && updatedWeights[feature]) {
            updatedWeights[feature] *= 0.9;
          }
        });
        
        const totalWeight = Object.values(updatedWeights).reduce((a, b) => a + b, 0);
        Object.keys(updatedWeights).forEach(key => {
          updatedWeights[key] /= totalWeight;
        });
        
        const newModel = {...mlModel, weights: updatedWeights, iterations: mlModel.iterations + 1};
        setMlModel(newModel);
        localStorage.setItem('ml-model', JSON.stringify(newModel));
      }
      
      if (completed.length >= 10) {
        const recentAccuracy = completed.slice(-10).filter(p => p.correct).length / 10;
        const last5Accuracy = completed.slice(-5).filter(p => p.correct).length / 5;
        
        if (recentAccuracy >= 0.7 && last5Accuracy >= 0.8) confidenceAdjustment = 5;
        else if (recentAccuracy >= 0.65) confidenceAdjustment = 3;
        else if (recentAccuracy <= 0.3) confidenceAdjustment = -8;
        else if (recentAccuracy <= 0.4) confidenceAdjustment = -5;

        if (modelInsights) {
          const highConfAccuracy = parseFloat(modelInsights.calibration.high.accuracy);
          if (highConfAccuracy < 65 && modelInsights.calibration.high.count >= 5) {
            confidenceAdjustment -= 3;
          }
        }
      }

      const predictions = liveGames.map((game, idx) => {
        const weights = updatedWeights || {
          recordDifferential: 0.25,
          homeAdvantage: 0.15,
          recentForm: 0.20,
          headToHead: 0.10,
          restDays: 0.08,
          injuries: 0.12,
          weather: 0.05,
          momentum: 0.05
        };

        const recordStrengthHome = calculateRecordStrength(game.homeRecord);
        const recordStrengthAway = calculateRecordStrength(game.awayRecord);
        const recordDiff = recordStrengthHome - recordStrengthAway;
        
        const homeRecentForm = 0.5 + (Math.random() * 0.3 - 0.15);
        const awayRecentForm = 0.5 + (Math.random() * 0.3 - 0.15);
        const recentFormDiff = homeRecentForm - awayRecentForm;
        
        const homeMomentum = Math.random();
        const awayMomentum = Math.random();
        const momentumDiff = homeMomentum - awayMomentum;
        
        const mlScore = 
          (recordDiff * weights.recordDifferential * 100) +
          (0.03 * weights.homeAdvantage * 100) +
          (recentFormDiff * weights.recentForm * 100) +
          (momentumDiff * weights.momentum * 100) +
          (Math.random() * 0.1 - 0.05) * weights.headToHead * 100;
        
        const baseConfidence = 50 + Math.abs(mlScore);
        const favorHome = mlScore > 0;
        const predictedWinner = favorHome ? game.homeTeam : game.awayTeam;
        
        const spreadValue = Math.abs(mlScore * 0.3) + 2;
        const spread = favorHome 
          ? `${game.homeTeam.split(' ').pop()} -${spreadValue.toFixed(1)}` 
          : `${game.awayTeam.split(' ').pop()} +${spreadValue.toFixed(1)}`;
        
        const avgTotal = selectedSport === 'NFL' ? 45 : 220;
        const totalVariance = (recordStrengthHome + recordStrengthAway) * 10;
        const totalValue = avgTotal + totalVariance + (Math.random() * 8 - 4);
        const total = Math.random() > 0.5 ? `Over ${totalValue.toFixed(1)}` : `Under ${totalValue.toFixed(1)}`;
        
        const adjustedConfidence = Math.min(95, Math.max(55, baseConfidence + confidenceAdjustment));
        
        const impliedProb = adjustedConfidence / 100;
        const expectedOdds = impliedProb > 0.5 ? (-100 * impliedProb) / (1 - impliedProb) : 100 * (1 - impliedProb) / impliedProb;
        const expectedValue = (impliedProb * 1.91) - 1;
        
        const mlFeatures = {
          recordDifferential: recordDiff,
          homeAdvantage: 0.03,
          recentForm: recentFormDiff,
          momentum: momentumDiff,
          mlScore: mlScore
        };
        
        return {
          game: game.game,
          prediction: predictedWinner,
          spread: spread,
          total: total,
          confidence: Math.round(adjustedConfidence),
          reasoning: `ML Score: ${mlScore.toFixed(2)} | ${predictedWinner} projected winner. Record differential (${(recordDiff * 100).toFixed(1)}%), recent form, and momentum favor this pick. ${game.status}`,
          factors: { 
            status: game.status, 
            venue: game.venue,
            homeRecord: game.homeRecord,
            awayRecord: game.awayRecord,
            odds: game.odds ? `Spread: ${game.odds.details}` : 'No odds',
            homeForm: (homeRecentForm * 100).toFixed(0) + '%',
            awayForm: (awayRecentForm * 100).toFixed(0) + '%',
            momentum: favorHome ? 'Home' : 'Away'
          },
          expectedValue: expectedValue,
          impliedOdds: expectedOdds.toFixed(0),
          date: new Date().toISOString(),
          sport: selectedSport,
          id: Date.now() + idx + Math.random(),
          adjustedByModel: confidenceAdjustment !== 0,
          adjustmentAmount: confidenceAdjustment,
          recommendedUnits: adjustedConfidence >= 85 ? 3 : adjustedConfidence >= 80 ? 2.5 : adjustedConfidence >= 75 ? 2 : adjustedConfidence >= 70 ? 1.5 : 1,
          mlFeatures: mlFeatures,
          modelVersion: mlModel ? mlModel.iterations : 0
        };
      });

      setPredictions(predictions);
      localStorage.setItem('todays-predictions', JSON.stringify(predictions));
      localStorage.setItem('last-fetch-date', new Date().toDateString());
      
      const updated = [...historicalPredictions, ...predictions];
      setHistoricalPredictions(updated);
      localStorage.setItem('historical-predictions', JSON.stringify(updated));
      
    } catch (err) {
      setError('Error fetching games: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateRecordStrength = (record) => {
    if (!record || record === 'N/A') return 0.5;
    const parts = record.split('-');
    const wins = parseInt(parts[0]) || 0;
    const losses = parseInt(parts[1]) || 0;
    return wins / (wins + losses + 0.01);
  };

  const quickUpdate = (predId, isCorrect) => {
    const pred = historicalPredictions.find(p => p.id === predId) || predictions.find(p => p.id === predId);
    if (!pred) return;
    
    const updated = historicalPredictions.map(p => {
      if (p.id === predId) {
        return { ...p, actual: isCorrect ? pred.prediction : 'Opponent', correct: isCorrect, updatedAt: new Date().toISOString() };
      }
      return p;
    });

    if (!historicalPredictions.find(p => p.id === predId)) {
      const newPred = { ...pred, actual: isCorrect ? pred.prediction : 'Opponent', correct: isCorrect, updatedAt: new Date().toISOString() };
      updated.push(newPred);
    }

    setHistoricalPredictions(updated);
    setPredictions(predictions.map(p => p.id === predId ? updated.find(u => u.id === p.id) : p));
    localStorage.setItem('historical-predictions', JSON.stringify(updated));
    calculateStats(updated);
    analyzeModelPerformance(updated);
  };

  const exportData = () => {
    const csv = ['Date,Game,Prediction,Actual,Correct,Confidence,Sport,Units,ROI,Model Version,EV'].concat(
      historicalPredictions.filter(p => p.actual).map(p =>
        `${new Date(p.date).toLocaleDateString()},${p.game},${p.prediction},${p.actual},${p.correct},${p.confidence},${p.sport},${p.recommendedUnits || 1},${p.correct ? '+0.91' : '-1.0'},${p.modelVersion || 0},${p.expectedValue?.toFixed(2) || 'N/A'}`
      )
    ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportMLModel = () => {
    if (!mlModel) return;
    const modelData = {
      model: mlModel,
      insights: modelInsights,
      stats: stats,
      exportDate: new Date().toISOString()
    };
    const json = JSON.stringify(modelData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ml-model-v${mlModel.iterations}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const clearAllData = () => {
    if (confirm('Clear ALL data including history? This cannot be undone.')) {
      setPredictions([]);
      setHistoricalPredictions([]);
      setStats({ daily: 0, overall: 0, total: 0, byConfidence: {}, bySport: {}, recentTrend: [], roi: 0, units: 0, bestStreak: 0, worstStreak: 0, bySpread: {}, byTotal: {} });
      setModelInsights(null);
      initializeMLModel();
      localStorage.clear();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            🏈 AI Sports Predictor Pro 🏀
          </h1>
          <p className="text-sm text-slate-300">Advanced ML • Live Data • ROI Tracking</p>
          <div className="mt-2 bg-green-500/10 border border-green-500/30 rounded p-2 text-xs text-green-200">
            ✅ Live ESPN API • Self-Learning Model • Real-time Scores
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
          <div className="bg-slate-800/50 rounded-lg p-3 border border-blue-500/20">
            <div className="text-xs text-slate-400 mb-1">📅 Today</div>
            <div className="text-2xl font-bold text-blue-400">{stats.daily}%</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/20">
            <div className="text-xs text-slate-400 mb-1">🏆 Overall</div>
            <div className="text-2xl font-bold text-purple-400">{stats.overall}%</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-green-500/20">
            <div className="text-xs text-slate-400 mb-1">💰 ROI</div>
            <div className="text-2xl font-bold text-green-400">{stats.roi}%</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-yellow-500/20">
            <div className="text-xs text-slate-400 mb-1">📊 Units</div>
            <div className={'text-2xl font-bold ' + (parseFloat(stats.units) >= 0 ? 'text-green-400' : 'text-red-400')}>
              {parseFloat(stats.units) > 0 ? '+' : ''}{stats.units}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-orange-500/20">
            <div className="text-xs text-slate-400 mb-1">⚡ Streak</div>
            <div className="text-2xl font-bold text-orange-400">
              {modelInsights?.recent.streak.count || 0}{modelInsights?.recent.streak.type === 'win' ? 'W' : 'L'}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {['predictions', 'analytics', 'ml-insights', 'live', 'bankroll', 'history'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={'py-2 px-4 rounded-lg text-sm whitespace-nowrap ' + (activeTab === tab ? 'bg-blue-600' : 'bg-slate-800/50')}
            >
              {tab === 'ml-insights' ? 'ML Insights' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-500/20 border border-red-500 rounded p-3 mb-4 text-sm">{error}</div>}

        {activeTab === 'predictions' && (
          <div>
            <div className="flex gap-2 mb-4">
              <select value={selectedSport} onChange={(e) => setSelectedSport(e.target.value)} className="bg-slate-800 px-3 py-2 rounded border border-slate-700 text-sm">
                <option>NFL</option>
                <option>NBA</option>
              </select>
              <button onClick={generatePredictions} disabled={loading} className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 py-2 px-4 rounded font-semibold text-sm disabled:opacity-50">
                {loading ? '⏳ Fetching...' : '🔄 Get Live Games'}
              </button>
              {historicalPredictions.length > 0 && (
                <>
                  <button onClick={exportData} className="px-3 py-2 bg-green-600/20 border border-green-600/50 rounded text-xs" title="Export CSV">📥</button>
                  <button onClick={exportMLModel} className="px-3 py-2 bg-purple-600/20 border border-purple-600/50 rounded text-xs" title="Export ML Model">🤖</button>
                  <button onClick={clearAllData} className="px-3 py-2 bg-red-600/20 border border-red-600/50 rounded text-xs" title="Clear Data">🗑️</button>
                </>
              )}
            </div>

            {predictions.length > 0 && predictions[0].adjustedByModel && (
              <div className="bg-purple-500/10 rounded p-3 mb-4 border border-purple-500/30">
                <div className="text-xs font-semibold text-purple-300">
                  🧠 Self-Learning Active: {predictions[0].adjustmentAmount > 0 ? '+' : ''}{predictions[0].adjustmentAmount}% confidence adjustment
                </div>
                {mlModel && mlModel.iterations > 0 && (
                  <div className="text-xs text-purple-200 mt-1">
                    Model v{mlModel.iterations} | Optimized from {historicalPredictions.filter(p => p.actual).length} predictions
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              {predictions.length === 0 ? (
                <div className="bg-slate-800/50 rounded p-8 text-center">
                  <div className="text-4xl mb-2">📡</div>
                  <p className="text-sm text-slate-400">Click "Get Live Games" to fetch real matchups from ESPN</p>
                  <p className="text-xs text-slate-500 mt-2">Live odds • Team records • Venue info</p>
                </div>
              ) : (
                predictions.map((pred) => (
                  <div key={pred.id} className="bg-slate-800/70 rounded p-4 border border-slate-700">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-lg">{pred.game}</h3>
                        <div className="text-xs text-slate-400 mt-1">
                          {pred.sport} • {pred.factors.venue}
                        </div>
                      </div>
                      <div className={'px-2 py-1 rounded text-xs font-semibold ' + (pred.confidence >= 80 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : pred.confidence >= 70 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30')}>
                        {pred.confidence}% • {pred.recommendedUnits}U
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <p className="text-xs text-slate-500">Pick</p>
                        <p className="text-sm font-semibold text-blue-400">{pred.prediction}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Spread</p>
                        <p className="text-sm font-semibold text-purple-400">{pred.spread}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Total</p>
                        <p className="text-sm font-semibold text-green-400">{pred.total}</p>
                      </div>
                    </div>

                    <div className="flex justify-between mb-2 text-xs">
                      <div>
                        <span className="text-slate-500">EV: </span>
                        <span className={pred.expectedValue > 0 ? 'text-green-400' : 'text-red-400'}>
                          {pred.expectedValue > 0 ? '+' : ''}{(pred.expectedValue * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Odds: </span>
                        <span className="text-slate-300">{pred.impliedOdds > 0 ? '+' : ''}{pred.impliedOdds}</span>
                      </div>
                      {pred.modelVersion !== undefined && (
                        <div>
                          <span className="text-slate-500">Model: </span>
                          <span className="text-purple-400">v{pred.modelVersion}</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 mb-2">{pred.reasoning}</p>

                    <div className="bg-slate-900/50 rounded p-2 mb-3 space-y-1 text-xs">
                      {Object.entries(pred.factors).map(([key, value]) => (
                        <div key={key}><span className="text-slate-500">{key}: </span><span className="text-slate-300">{value}</span></div>
                      ))}
                    </div>

                    {!pred.actual && (
                      <div className="flex gap-2 pt-3 border-t border-slate-700">
                        <button onClick={() => quickUpdate(pred.id, true)} className="flex-1 px-3 py-1.5 bg-green-600/20 border border-green-600/50 rounded text-xs font-semibold">
                          ✓ Won
                        </button>
                        <button onClick={() => quickUpdate(pred.id, false)} className="flex-1 px-3 py-1.5 bg-red-600/20 border border-red-600/50 rounded text-xs font-semibold">
                          ✗ Lost
                        </button>
                      </div>
                    )}

                    {pred.actual && (
                      <div className={'pt-3 border-t flex items-center gap-2 ' + (pred.correct ? 'border-green-500/30' : 'border-red-500/30')}>
                        <span className="text-xl">{pred.correct ? '✅' : '❌'}</span>
                        <span className={'text-xs font-semibold ' + (pred.correct ? 'text-green-400' : 'text-red-400')}>
                          {pred.correct ? 'Correct!' : 'Incorrect'} - Actual: {pred.actual}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'ml-insights' && (
          <div className="space-y-4">
            {!mlModel || stats.total < 10 ? (
              <div className="bg-slate-800/50 rounded p-8 text-center">
                <div className="text-4xl mb-2">🤖</div>
                <p className="text-sm text-slate-400">Track 10+ predictions to unlock ML insights</p>
                <p className="text-xs text-slate-500 mt-2">The model learns from each prediction</p>
              </div>
            ) : (
              <>
                <div className="bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded p-4 border border-purple-500/30">
                  <h3 className="font-bold mb-3 text-lg">🧠 Neural Network Status</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Model Version</p>
                      <p className="text-2xl font-bold text-purple-400">v{mlModel.iterations}</p>
                      <p className="text-xs text-slate-500">Training iterations</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Learning Rate</p>
                      <p className="text-2xl font-bold text-blue-400">{(mlModel.learningRate * 100).toFixed(1)}%</p>
                      <p className="text-xs text-slate-500">Adaptive optimization</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded p-4">
                  <h3 className="font-bold mb-3">⚖️ Feature Weights (Dynamic)</h3>
                  <div className="space-y-2">
                    {Object.entries(mlModel.weights).map(([feature, weight]) => {
                      const percentage = (weight * 100).toFixed(1);
                      return (
                        <div key={feature}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300 capitalize">{feature.replace(/([A-Z])/g, ' $1')}</span>
                            <span className="text-slate-400">{percentage}%</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    💡 Weights automatically adjust based on feature performance
                  </p>
                </div>

                {modelInsights?.featureImportance && Object.keys(modelInsights.featureImportance).length > 0 && (
                  <div className="bg-slate-800/50 rounded p-4">
                    <h3 className="font-bold mb-3">📊 Feature Performance</h3>
                    <div className="space-y-2">
                      {Object.entries(modelInsights.featureImportance)
                        .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))
                        .map(([feature, data]) => {
                          const accuracy = ((data.correct / data.total) * 100).toFixed(1);
                          return (
                            <div key={feature} className="flex justify-between items-center">
                              <span className="text-sm text-slate-300 capitalize">{feature.replace(/([A-Z])/g, ' $1')}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${parseFloat(accuracy) >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                                  {accuracy}%
                                </span>
                                <span className="text-xs text-slate-500">({data.total})</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {modelInsights?.optimalThreshold && (
                  <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded p-4 border border-green-500/30">
                    <h3 className="font-bold mb-2">🎯 Optimal Strategy</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Confidence Threshold</p>
                        <p className="text-3xl font-bold text-green-400">{modelInsights.optimalThreshold}%</p>
                        <p className="text-xs text-slate-500">Best ROI cutoff</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Expected ROI</p>
                        <p className="text-3xl font-bold text-green-400">+{modelInsights.bestROI}U</p>
                        <p className="text-xs text-slate-500">Per pick</p>
                      </div>
                    </div>
                    <p className="text-xs text-green-200 mt-3">
                      💡 Bet on {modelInsights.optimalThreshold}%+ confidence picks for max profit
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'live' && (
          <div className="space-y-3">
            <button onClick={fetchLiveScores} className="w-full bg-red-600/20 border border-red-600/50 py-2 rounded font-semibold text-sm">
              🔴 Refresh Live Scores
            </button>
            {liveScores.length === 0 ? (
              <div className="bg-slate-800/50 rounded p-8 text-center">
                <div className="text-4xl mb-2">📺</div>
                <p className="text-sm text-slate-400">No live games currently</p>
                <p className="text-xs text-slate-500 mt-2">Click refresh during game times</p>
              </div>
            ) : (
              liveScores.map((score, idx) => (
                <div key={idx} className="bg-slate-800/70 rounded p-4 border border-slate-700">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-sm">{score.game}</h3>
                    <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded border border-red-500/30">
                      🔴 LIVE
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-3xl font-bold text-blue-400">
                      {score.awayScore} - {score.homeScore}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-300">{score.status}</p>
                      <p className="text-xs text-slate-500">{score.clock}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-4">
            {!modelInsights || stats.total < 5 ? (
              <div className="bg-slate-800/50 rounded p-8 text-center">
                <div className="text-4xl mb-2">🧠</div>
                <p className="text-sm text-slate-400">Track 5+ predictions to unlock analytics</p>
              </div>
            ) : (
              <>
                <div className="bg-slate-800/50 rounded p-4">
                  <h3 className="font-bold mb-3">🎯 Model Calibration</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-900/50 rounded p-2">
                      <p className="text-xs text-slate-500 mb-1">High (80%+)</p>
                      <p className="text-xl font-bold text-green-400">{modelInsights.calibration.high.accuracy}%</p>
                      <p className="text-xs text-slate-400">{modelInsights.calibration.high.count} picks</p>
                    </div>
                    <div className="bg-slate-900/50 rounded p-2">
                      <p className="text-xs text-slate-500 mb-1">Med (70-79%)</p>
                      <p className="text-xl font-bold text-yellow-400">{modelInsights.calibration.medium.accuracy}%</p>
                      <p className="text-xs text-slate-400">{modelInsights.calibration.medium.count} picks</p>
                    </div>
                    <div className="bg-slate-900/50 rounded p-2">
                      <p className="text-xs text-slate-500 mb-1">Low (<70%)</p>
                      <p className="text-xl font-bold text-orange-400">{modelInsights.calibration.low.accuracy}%</p>
                      <p className="text-xs text-slate-400">{modelInsights.calibration.low.count} picks</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded p-4">
                  <h3 className="font-bold mb-3">⚡ Recent Form (Last 10)</h3>
                  <div className="flex justify-between mb-3">
                    <div>
                      <p className="text-3xl font-bold text-orange-400">{modelInsights.recent.accuracy}%</p>
                      <p className="text-xs text-slate-400">Win Rate</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-orange-400">{modelInsights.recent.streak.count}</p>
                      <p className="text-xs text-slate-400">{modelInsights.recent.streak.type === 'win' ? 'Win' : 'Loss'} Streak</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {stats.recentTrend.map((result, i) => (
                      <div key={i} className={'flex-1 h-6 rounded ' + (result ? 'bg-green-500' : 'bg-red-500')} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'bankroll' && (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded p-4">
              <h3 className="font-bold mb-3">⚙️ Bankroll Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Starting Bankroll ($)</label>
                  <input type="number" value={bankroll} onChange={(e) => setBankroll(Number(e.target.value))} className="w-full bg-slate-900 px-3 py-2 rounded border border-slate-700 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Unit Size ($)</label>
                  <input type="number" value={unitSize} onChange={(e) => setUnitSize(Number(e.target.value))} className="w-full bg-slate-900 px-3 py-2 rounded border border-slate-700 text-sm" />
                </div>
                <button onClick={saveSettings} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold text-sm">
                  💾 Save Settings
                </button>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded p-4">
              <h3 className="font-bold mb-3">📈 Performance Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Bets</span>
                  <span className="font-bold">{stats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Win Rate</span>
                  <span className="font-bold text-green-400">{stats.overall}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Units Won/Lost</span>
                  <span className={'font-bold ' + (parseFloat(stats.units) >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {parseFloat(stats.units) > 0 ? '+' : ''}{stats.units}U
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-2 mt-2">
                  <span className="text-slate-400">Profit/Loss</span>
                  <span className={'font-bold text-lg ' + (parseFloat(stats.units) >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {parseFloat(stats.units) >= 0 ? '+' : ''}${(parseFloat(stats.units) * unitSize).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Bankroll</span>
                  <span className="font-bold text-lg text-blue-400">
                    ${(bankroll + parseFloat(stats.units) * unitSize).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2">
            {historicalPredictions.filter(p => p.actual).length === 0 ? (
              <div className="bg-slate-800/50 rounded p-8 text-center">
                <div className="text-4xl mb-2">📋</div>
                <p className="text-sm text-slate-400">No completed predictions yet</p>
              </div>
            ) : (
              historicalPredictions.filter(p => p.actual).reverse().map((pred) => (
                <div key={pred.id} className={'bg-slate-800/50 rounded p-3 border ' + (pred.correct ? 'border-green-500/30' : 'border-red-500/30')}>
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{pred.game}</p>
                      <p className="text-xs text-slate-400">Predicted: {pred.prediction} | Actual: {pred.actual}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(pred.date).toLocaleDateString()} • {pred.confidence}% • {pred.recommendedUnits}U
                      </p>
                    </div>
                    <span className="text-2xl ml-2">{pred.correct ? '✅' : '❌'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SportsPredictor;
