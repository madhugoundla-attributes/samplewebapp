using System;
using System.Collections.Generic;
using System.Dynamic;
using System.Runtime.CompilerServices;
using System.Text;

namespace VeritySDK.Utils
{
    /// <summary>
    /// Extension for safe get values from Dictionary
    /// </summary>
    public static class DictionaryExtension
    {
        public static TValue Get<TKey, TValue>(this IDictionary<TKey, TValue> dictionary, TKey key)
        {
            TValue value = default(TValue);
            dictionary.TryGetValue(key, out value);
            return value;
        }
    }
}
