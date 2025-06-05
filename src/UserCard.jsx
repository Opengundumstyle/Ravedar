function UserCard({ user }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-4 flex flex-col items-center w-full max-w-sm sm:max-w-md md:max-w-lg mx-auto transition-all duration-300 border border-gray-100 cursor-pointer min-h-[60vh]">
      {/* Responsive photo carousel with aspect ratio and cropping */}
      {user.photos && user.photos.length > 0 && (
        <div className="w-full flex justify-center mb-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
            {user.photos.map((photo, idx) => (
              <div
                key={photo.id || `${photo.user_id}-${photo.position}` || idx}
                className="aspect-[4/5] w-40 sm:w-48 md:w-56 max-w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm flex-shrink-0"
              >
                <img
                  src={photo.image_url}
                  alt="User pic"
                  className="w-full h-full object-cover object-center"
                  draggable={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mb-2 font-bold text-lg sm:text-xl md:text-2xl text-gray-800 text-center truncate w-full">
        {user.name} {user.instagram && <span className="text-gray-400 text-base">@{user.instagram}</span>}
      </div>
      <div className="mb-2 text-sm sm:text-base text-gray-600 text-center w-full break-words line-clamp-3">{user.about_me}</div>
      <div className="mb-2 w-full flex justify-center">
        {user.vibe_tags && user.vibe_tags.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {user.vibe_tags.map((tag, i) => (
              <span key={i} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserCard; 