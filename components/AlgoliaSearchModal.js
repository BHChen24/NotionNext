import replaceSearchResult from '@/components/Mark'
import { siteConfig } from '@/lib/config'
import { useGlobal } from '@/lib/global'
import algoliasearch from 'algoliasearch'
import throttle from 'lodash/throttle'
import SmartLink from '@/components/SmartLink'
import { useRouter } from 'next/router'
import {
  Fragment,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

const ShortCutActions = [
  {
    key: '↑ ↓',
    action: 'Select'
  },
  {
    key: 'Enter',
    action: 'Jump To'
  },
  {
    key: 'Esc',
    action: 'Close'
  }
]

/**
 * Pop-up search modal implemented with Algolia
 * Open method: cRef.current.openSearch()
 * https://www.algolia.com/doc/api-reference/search-api-parameters/
 */
export default function AlgoliaSearchModal({ cRef }) {
  const [searchResults, setSearchResults] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [keyword, setKeyword] = useState(null)
  const [totalPage, setTotalPage] = useState(0)
  const [totalHit, setTotalHit] = useState(0)
  const [useTime, setUseTime] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)

  const inputRef = useRef(null)
  const router = useRouter()

  /**
   * Hotkey settings
   */
  useHotkeys('ctrl+k', e => {
    e.preventDefault()
    setIsModalOpen(true)
  })
  // Modify hotkey usage logic
  useHotkeys(
    'down',
    e => {
      if (isInputFocused) {
        // Only trigger when focused
        e.preventDefault()
        if (activeIndex < searchResults.length - 1) {
          setActiveIndex(activeIndex + 1)
        }
      }
    },
    { enableOnFormTags: true }
  )
  useHotkeys(
    'up',
    e => {
      if (isInputFocused) {
        e.preventDefault()
        if (activeIndex > 0) {
          setActiveIndex(activeIndex - 1)
        }
      }
    },
    { enableOnFormTags: true }
  )
  useHotkeys(
    'esc',
    e => {
      if (isInputFocused) {
        e.preventDefault()
        setIsModalOpen(false)
      }
    },
    { enableOnFormTags: true }
  )
  useHotkeys(
    'enter',
    e => {
      if (isInputFocused && searchResults.length > 0) {
        onJumpSearchResult(index)
      }
    },
    { enableOnFormTags: true }
  )
  // Jump to search result
  const onJumpSearchResult = () => {
    if (searchResults.length > 0) {
      const searchResult = searchResults[activeIndex]
      window.location.href = `${siteConfig('SUB_PATH', '')}/${searchResult.slug || searchResult.objectID}`
    }
  }

  const resetSearch = () => {
    setActiveIndex(0)
    setKeyword('')
    setSearchResults([])
    setUseTime(0)
    setTotalPage(0)
    setTotalHit(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  /**
   * Auto close modal after page path changes
   */
  useEffect(() => {
    setIsModalOpen(false)
  }, [router])

  /**
   * Auto focus search input
   */
  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    } else {
      resetSearch()
    }
  }, [isModalOpen])

  /**
   * Expose methods to parent component
   **/
  useImperativeHandle(cRef, () => {
    return {
      openSearch: () => {
        setIsModalOpen(true)
      }
    }
  })

  const client = algoliasearch(
    siteConfig('ALGOLIA_APP_ID'),
    siteConfig('ALGOLIA_SEARCH_ONLY_APP_KEY')
  )
  const index = client.initIndex(siteConfig('ALGOLIA_INDEX'))

  /**
   * Search function
   * @param {*} query
   */
  const handleSearch = async (query, page) => {
    setKeyword(query)
    setPage(page)
    setSearchResults([])
    setUseTime(0)
    setTotalPage(0)
    setTotalHit(0)
    setActiveIndex(0)
    if (!query || query === '') {
      return
    }
    setIsLoading(true)
    try {
      const res = await index.search(query, { page, hitsPerPage: 10 })
      const { hits, nbHits, nbPages, processingTimeMS } = res
      setUseTime(processingTimeMS)
      setTotalPage(nbPages)
      setTotalHit(nbHits)
      setSearchResults(hits)
      setIsLoading(false)
      const doms = document
        .getElementById('search-wrapper')
        .getElementsByClassName('replace')

      setTimeout(() => {
        replaceSearchResult({
          doms,
          search: query,
          target: {
            element: 'span',
            className: 'font-bold border-b border-dashed'
          }
        })
      }, 200) // Delayed highlighting
    } catch (error) {
      console.error('Algolia search error:', error)
    }
  }

  // Define throttle function to ensure search is called only after user stops typing for a while
  const throttledHandleInputChange = useRef(
    throttle((query, page = 0) => {
      handleSearch(query, page)
    }, 1000)
  )

  // Timer for storing search delay
  const searchTimer = useRef(null)

  // Modify input onChange event handler
  const handleInputChange = e => {
    const query = e.target.value

    // If there's already a timer waiting for search, clear the previous timer first
    if (searchTimer.current) {
      clearTimeout(searchTimer.current)
    }

    // Set new timer to trigger search after user stops typing for a while
    searchTimer.current = setTimeout(() => {
      throttledHandleInputChange.current(query)
    }, 800)
  }

  /**
   * Switch page
   * @param {*} page
   */
  const switchPage = page => {
    throttledHandleInputChange.current(keyword, page)
  }

  /**
   * Close modal
   */
  const closeModal = () => {
    setIsModalOpen(false)
  }

  if (!siteConfig('ALGOLIA_APP_ID')) {
    return <></>
  }
  return (
    <div
      id='search-wrapper'
      className={`${
        isModalOpen ? 'opacity-100' : 'invisible opacity-0 pointer-events-none'
      } z-30 fixed h-screen w-screen left-0 top-0 sm:mt-[10vh] flex items-start justify-center mt-0`}>
      {/* Modal */}
      <div
        className={`${
          isModalOpen ? 'opacity-100' : 'invisible opacity-0 translate-y-10'
        } max-h-[80vh] flex flex-col justify-between w-full min-h-[10rem] h-full md:h-fit max-w-xl dark:bg-hexo-black-gray dark:border-gray-800 bg-white dark:bg- p-5 rounded-lg z-50 shadow border hover:border-blue-600 duration-300 transition-all `}>
        <div className='flex justify-between items-center'>
          <div className='text-2xl text-blue-600 dark:text-yellow-600 font-bold'>
            Search
          </div>
          <div>
            <i
              className='text-gray-600 fa-solid fa-xmark p-1 cursor-pointer hover:text-blue-600'
              onClick={closeModal}></i>
          </div>
        </div>

        <input
          type='text'
          placeholder='Enter search keywords here...'
          onChange={e => handleInputChange(e)}
          onFocus={() => setIsInputFocused(true)} // When focused
          onBlur={() => setIsInputFocused(false)} // When loses focus
          className='text-black dark:text-gray-200 bg-gray-50 dark:bg-gray-600 outline-blue-500 w-full px-4 my-2 py-1 mb-4 border rounded-md'
          ref={inputRef}
        />

        {/* Tag groups */}
        <div className='mb-4'>
          <TagGroups />
        </div>
        {searchResults.length === 0 && keyword && !isLoading && (
          <div>
            <p className=' text-slate-600 text-center my-4 text-base'>
              {' '}
              No results found for
              <span className='font-semibold'>&quot;{keyword}&quot;</span>
            </p>
          </div>
        )}
        <ul className='flex-1 overflow-auto'>
          {searchResults.map((result, index) => (
            <li
              key={result.objectID}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onJumpSearchResult(index)}
              className={`cursor-pointer replace my-2 p-2 duration-100 
              rounded-lg
              ${activeIndex === index ? 'bg-blue-600 dark:bg-yellow-600' : ''}`}>
              <a
                className={`${activeIndex === index ? ' text-white' : ' text-black dark:text-gray-300 '}`}>
                {result.title}
              </a>
            </li>
          ))}
        </ul>
        <Pagination totalPage={totalPage} page={page} switchPage={switchPage} />
        <div className='flex items-center justify-between mt-2 sm:text-sm text-xs dark:text-gray-300'>
          {totalHit === 0 && (
            <div className='flex items-center'>
              {ShortCutActions.map((action, index) => {
                return (
                  <Fragment key={index}>
                    <div className='border-gray-300 dark:text-gray-300 text-gray-600 px-2 rounded border inline-block'>
                      {action.key}
                    </div>
                    <span className='ml-2 mr-4  text-gray-600 dark:text-gray-300'>
                      {action.action}
                    </span>
                  </Fragment>
                )
              })}
            </div>
          )}
          <div>
            {totalHit > 0 && (
              <p>
                Found {totalHit} results in {useTime} milliseconds
              </p>
            )}
          </div>
          <div className='text-gray-600 dark:text-gray-300  text-right'>
            <span>
              <i className='fa-brands fa-algolia'></i> Search powered by Algolia
            </span>
          </div>
        </div>
      </div>

      {/* Overlay */}
      <div
        onClick={closeModal}
        className='z-30 fixed top-0 left-0 w-full h-full flex items-center justify-center glassmorphism'
      />
    </div>
  )
}

/**
 * Tag groups component
 */
function TagGroups() {
  const { tagOptions } = useGlobal()
  // Get first ten items from tagOptions array
  const firstTenTags = tagOptions?.slice(0, 10)

  return (
    <div id='tags-group' className='dark:border-gray-700 space-y-2'>
      {firstTenTags?.map((tag, index) => {
        return (
          <SmartLink
            passHref
            key={index}
            href={`/tag/${encodeURIComponent(tag.name)}`}
            className={'cursor-pointer inline-block whitespace-nowrap'}>
            <div
              className={
                'flex items-center text-black dark:text-gray-300 hover:bg-blue-600 dark:hover:bg-yellow-600 hover:scale-110 hover:text-white rounded-lg px-2 py-0.5 duration-150 transition-all'
              }>
              <div className='text-lg'>{tag.name} </div>
              {tag.count ? (
                <sup className='relative ml-1'>{tag.count}</sup>
              ) : (
                <></>
              )}
            </div>
          </SmartLink>
        )
      })}
    </div>
  )
}

/**
 * Pagination component
 * @param {*} param0
 */
function Pagination(props) {
  const { totalPage, page, switchPage } = props
  if (totalPage <= 0) {
    return <></>
  }
  return (
    <div className='flex space-x-1 w-full justify-center py-1'>
      {Array.from({ length: totalPage }, (_, i) => {
        const classNames =
          page === i
            ? 'font-bold text-white bg-blue-600 dark:bg-yellow-600 rounded'
            : 'hover:text-blue-600 hover:font-bold dark:text-gray-300'

        return (
          <div
            onClick={() => switchPage(i)}
            className={`text-center cursor-pointer w-6 h-6 ${classNames}`}
            key={i}>
            {i + 1}
          </div>
        )
      })}
    </div>
  )
}
